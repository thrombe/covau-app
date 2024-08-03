use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::sync::Arc;
use warp::Filter;
use tokio::io::AsyncWriteExt;

use super::routes::ProxyRequest;
use crate::covau_types;
use crate::db::Db;
use crate::server::routes::{webui_js_route, AppState, Asset, FeRequest, FrontendClient};
use crate::yt::YtiRequest;

// [Rejection and anyhow](https://github.com/seanmonstar/warp/issues/307#issuecomment-570833388)
#[derive(Debug)]
struct CustomReject(anyhow::Error);

impl warp::reject::Reject for CustomReject {}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct ErrorMessage {
    pub message: String,
    pub stack_trace: String,
}
impl core::fmt::Debug for ErrorMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)?;
        f.write_str("\n\nErrorMessage stacktrace:\n")?;
        f.write_str(&self.stack_trace)
    }
}
impl core::fmt::Display for ErrorMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for ErrorMessage {}

pub(crate) fn custom_reject(error: impl Into<anyhow::Error>) -> warp::Rejection {
    warp::reject::custom(CustomReject(error.into()))
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum MessageResult<T> {
    Ok(T),
    Err(ErrorMessage),
}
impl<T: Serialize> MessageResult<T> {
    pub fn json(self) -> MessageResult<String> {
        match self {
            MessageResult::Ok(t) => MessageResult::Ok(serde_json::to_string(&t).unwrap()),
            MessageResult::Err(e) => MessageResult::Err(e),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Message<T> {
    pub id: Option<u32>,
    #[serde(flatten)]
    pub data: MessageResult<T>,
}

pub mod db_server {
    use sea_orm::ConnectionTrait;

    use crate::db::{Db, DbAble, DbId, DbItem, DbMetadata, SearchQuery, TransactionId, Typ};

    use super::message_server::*;
    use super::*;

    #[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum InsertResponse<T> {
        New(T),
        Old(T),
    }

    #[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum DbRequest {
        Begin,
        Commit(TransactionId),
        Rollback(TransactionId),
        Insert {
            transaction_id: TransactionId,
            typ: Typ,
            item: String,
        },
        InsertOrGet {
            transaction_id: TransactionId,
            typ: Typ,
            item: String,
        },
        Update {
            transaction_id: TransactionId,
            item: DbItem<String>,
        },
        UpdateMetadata {
            transaction_id: TransactionId,
            id: crate::db::DbId,
            typ: Typ,
            metadata: crate::db::DbMetadata,
        },
        Delete {
            transaction_id: TransactionId,
            item: DbItem<String>,
        },
        Search {
            typ: Typ,
            query: SearchQuery,
        },
        GetByRefid {
            typ: Typ,
            refid: String,
        },
        GetManyByRefid {
            typ: Typ,
            refids: Vec<String>,
        },
        GetById {
            typ: Typ,
            id: DbId,
        },
        GetManyById {
            typ: Typ,
            ids: Vec<DbId>,
        },
    }

    type LocalState = crate::covau_types::LocalState;
    type Song = crate::covau_types::Song;
    type Playlist = crate::covau_types::Playlist;
    type Queue = crate::covau_types::Queue;
    type ArtistBlacklist = crate::covau_types::ArtistBlacklist;
    type SongBlacklist = crate::covau_types::SongBlacklist;
    type Updater = crate::covau_types::Updater;
    type StSong = crate::yt::song_tube::Song;
    type StAlbum = crate::yt::song_tube::Album;
    type StPlaylist = crate::yt::song_tube::Playlist;
    type StArtist = crate::yt::song_tube::Artist;
    type MmSong = crate::musimanager::Song<Option<crate::musimanager::SongInfo>, crate::covau_types::SourcePath>;
    type MmAlbum = crate::musimanager::Album<crate::yt::VideoId>;
    type MmPlaylist = crate::musimanager::Playlist<crate::yt::VideoId>;
    type MmQueue = crate::musimanager::Queue<crate::yt::VideoId>;
    type MmArtist = crate::musimanager::Artist<crate::yt::VideoId, crate::yt::AlbumId>;
    type MbzRecording = crate::mbz::RecordingWithInfo;
    type MbzArtist = crate::mbz::Artist;

    #[async_trait::async_trait]
    impl MessageServerRequest for DbRequest {
        type Ctx = Db;

        async fn handle(self, db: Self::Ctx) -> anyhow::Result<MessageResult<String>> {
            async fn insert<T: DbAble>(
                txn: &impl ConnectionTrait,
                data: String,
            ) -> anyhow::Result<MessageResult<String>> {
                let item: T = serde_json::from_str(&data)?;
                let id = item.insert(txn).await?;
                let dbitem = DbItem {
                    metadata: crate::db::DbMetadata::new(),
                    id,
                    typ: T::typ(),
                    t: item,
                };
                Ok(MessageResult::Ok(dbitem).json())
            }
            async fn insert_or_get<T: DbAble>(
                txn: &impl ConnectionTrait,
                data: String,
            ) -> anyhow::Result<MessageResult<String>> {
                let item: T = serde_json::from_str(&data)?;
                let old = item.get_by_refid(txn).await?;
                let dbitem = match old {
                    Some(e) => InsertResponse::Old(e),
                    None => {
                        let id = item.insert(txn).await?;
                        let dbitem = DbItem {
                            metadata: crate::db::DbMetadata::new(),
                            id,
                            typ: T::typ(),
                            t: item,
                        };
                        InsertResponse::New(dbitem)
                    }
                };
                Ok(MessageResult::Ok(dbitem).json())
            }
            async fn update<T: DbAble>(
                txn: &impl ConnectionTrait,
                data: DbItem<String>,
            ) -> anyhow::Result<MessageResult<String>> {
                let item: DbItem<T> = data.parsed()?;
                let meta = item.update(txn).await?;
                let dbitem = DbItem {
                    metadata: meta,
                    id: item.id,
                    typ: T::typ(),
                    t: item.t,
                };
                Ok(MessageResult::Ok(dbitem).json())
            }
            async fn update_metadata<T: DbAble>(
                txn: &impl ConnectionTrait,
                id: DbId,
                mdata: DbMetadata,
            ) -> anyhow::Result<MessageResult<String>> {
                let mdata = T::update_mdata(txn, id, mdata).await?;
                Ok(MessageResult::Ok(mdata).json())
            }
            async fn delete<T: DbAble>(
                txn: &impl ConnectionTrait,
                data: DbItem<String>,
            ) -> anyhow::Result<MessageResult<String>> {
                let item: DbItem<T> = data.parsed()?;
                item.delete(txn).await?;
                Ok(MessageResult::Ok(()).json())
            }
            async fn search<T: DbAble>(
                db: Db,
                query: SearchQuery,
            ) -> anyhow::Result<MessageResult<String>> {
                let res = db.search::<T>(query).await?;
                Ok(MessageResult::Ok(res).json())
            }
            async fn get_by_refid<T: DbAble>(
                db: Db,
                refid: String,
            ) -> anyhow::Result<MessageResult<String>> {
                let res = db
                    .search_by_ref_id::<T>(refid)
                    .await?;
                Ok(MessageResult::Ok(res).json())
            }
            async fn get_many_by_refid<T: DbAble>(
                db: Db,
                refids: Vec<String>,
            ) -> anyhow::Result<MessageResult<String>> {
                let res = db
                    .search_many_by_ref_id::<T>(refids)
                    .await?;
                Ok(MessageResult::Ok(res).json())
            }
            async fn get_by_id<T: DbAble>(
                db: Db,
                id: DbId,
            ) -> anyhow::Result<MessageResult<String>> {
                let res = db
                    .search_by_id::<T>(id)
                    .await?;
                Ok(MessageResult::Ok(res).json())
            }
            async fn get_many_by_id<T: DbAble>(
                db: Db,
                ids: Vec<DbId>,
            ) -> anyhow::Result<MessageResult<String>> {
                let res = db
                    .search_many_by_id::<T>(ids)
                    .await?;
                Ok(MessageResult::Ok(res).json())
            }

            let res = match self {
                DbRequest::Begin => {
                    let id = db.begin().await?;
                    MessageResult::Ok(id).json()
                }
                DbRequest::Commit(id) => {
                    db.commit(id).await?;
                    MessageResult::Ok(()).json()
                }
                DbRequest::Rollback(id) => {
                    db.rollback(id).await?;
                    MessageResult::Ok(()).json()
                }
                DbRequest::Insert {
                    transaction_id,
                    typ,
                    item,
                } => {
                    let txn = db.transaction.lock().await;
                    match txn.as_ref() {
                        Some((tid, txn)) => {
                            if *tid != transaction_id {
                                let msg = "Transaction Inactive";
                                MessageResult::Err(ErrorMessage {
                                    message: msg.into(),
                                    stack_trace: msg.into(),
                                })
                            } else {
                                match typ {
                                    Typ::LocalState => {
                                        let msg = "Operation Not Allowed";
                                        MessageResult::Err(ErrorMessage {
                                            message: msg.into(),
                                            stack_trace: msg.into(),
                                        })
                                    },
                                    Typ::MmSong => insert::<MmSong>(txn, item).await?,
                                    Typ::MmAlbum => insert::<MmAlbum>(txn, item).await?,
                                    Typ::MmArtist => insert::<MmArtist>(txn, item).await?,
                                    Typ::MmPlaylist => insert::<MmPlaylist>(txn, item).await?,
                                    Typ::MmQueue => insert::<MmQueue>(txn, item).await?,
                                    Typ::Song => insert::<Song>(txn, item).await?,
                                    Typ::Playlist => insert::<Playlist>(txn, item).await?,
                                    Typ::Queue => insert::<Queue>(txn, item).await?,
                                    Typ::ArtistBlacklist => insert::<ArtistBlacklist>(txn, item).await?,
                                    Typ::SongBlacklist => insert::<SongBlacklist>(txn, item).await?,
                                    Typ::Updater => insert::<Updater>(txn, item).await?,
                                    Typ::StSong => insert::<StSong>(txn, item).await?,
                                    Typ::StAlbum => insert::<StAlbum>(txn, item).await?,
                                    Typ::StPlaylist => insert::<StPlaylist>(txn, item).await?,
                                    Typ::StArtist => insert::<StArtist>(txn, item).await?,
                                    Typ::MbzRecording => insert::<MbzRecording>(txn, item).await?,
                                    Typ::MbzArtist => insert::<MbzArtist>(txn, item).await?,
                                }
                            }
                        }
                        None => {
                            let msg = "No Transaction Active";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        }
                    }
                },
                DbRequest::InsertOrGet {
                    transaction_id,
                    typ,
                    item,
                } => {
                    let txn = db.transaction.lock().await;
                    match txn.as_ref() {
                        Some((tid, txn)) => {
                            if *tid != transaction_id {
                                let msg = "Transaction Inactive";
                                MessageResult::Err(ErrorMessage {
                                    message: msg.into(),
                                    stack_trace: msg.into(),
                                })
                            } else {
                                match typ {
                                    Typ::LocalState => {
                                        let msg = "Operation Not Allowed";
                                        MessageResult::Err(ErrorMessage {
                                            message: msg.into(),
                                            stack_trace: msg.into(),
                                        })
                                    },
                                    Typ::MmSong => insert_or_get::<MmSong>(txn, item).await?,
                                    Typ::MmAlbum => insert_or_get::<MmAlbum>(txn, item).await?,
                                    Typ::MmArtist => insert_or_get::<MmArtist>(txn, item).await?,
                                    Typ::MmPlaylist => insert_or_get::<MmPlaylist>(txn, item).await?,
                                    Typ::MmQueue => insert_or_get::<MmQueue>(txn, item).await?,
                                    Typ::Song => insert_or_get::<Song>(txn, item).await?,
                                    Typ::Playlist => insert_or_get::<Playlist>(txn, item).await?,
                                    Typ::Queue => insert_or_get::<Queue>(txn, item).await?,
                                    Typ::ArtistBlacklist => insert_or_get::<ArtistBlacklist>(txn, item).await?,
                                    Typ::SongBlacklist => insert_or_get::<SongBlacklist>(txn, item).await?,
                                    Typ::Updater => insert_or_get::<Updater>(txn, item).await?,
                                    Typ::StSong => insert_or_get::<StSong>(txn, item).await?,
                                    Typ::StAlbum => insert_or_get::<StAlbum>(txn, item).await?,
                                    Typ::StPlaylist => insert_or_get::<StPlaylist>(txn, item).await?,
                                    Typ::StArtist => insert_or_get::<StArtist>(txn, item).await?,
                                    Typ::MbzRecording => insert_or_get::<MbzRecording>(txn, item).await?,
                                    Typ::MbzArtist => insert_or_get::<MbzArtist>(txn, item).await?,
                                }
                            }
                        }
                        None => {
                            let msg = "No Transaction Active";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        }
                    }
                }
                DbRequest::Update {
                    transaction_id,
                    item,
                } => {
                    let txn = db.transaction.lock().await;
                    match txn.as_ref() {
                        Some((tid, txn)) => {
                            if *tid != transaction_id {
                                let msg = "Transaction Inactive";
                                MessageResult::Err(ErrorMessage {
                                    message: msg.into(),
                                    stack_trace: msg.into(),
                                })
                            } else {
                                match item.typ {
                                    Typ::MmSong => update::<MmSong>(txn, item).await?,
                                    Typ::MmAlbum => update::<MmAlbum>(txn, item).await?,
                                    Typ::MmArtist => update::<MmArtist>(txn, item).await?,
                                    Typ::MmPlaylist => update::<MmPlaylist>(txn, item).await?,
                                    Typ::MmQueue => update::<MmQueue>(txn, item).await?,
                                    Typ::LocalState => update::<LocalState>(txn, item).await?,
                                    Typ::Song => update::<Song>(txn, item).await?,
                                    Typ::Playlist => update::<Playlist>(txn, item).await?,
                                    Typ::Queue => update::<Queue>(txn, item).await?,
                                    Typ::ArtistBlacklist => update::<ArtistBlacklist>(txn, item).await?,
                                    Typ::SongBlacklist => update::<SongBlacklist>(txn, item).await?,
                                    Typ::Updater => update::<Updater>(txn, item).await?,
                                    Typ::StSong => update::<StSong>(txn, item).await?,
                                    Typ::StAlbum => update::<StAlbum>(txn, item).await?,
                                    Typ::StPlaylist => update::<StPlaylist>(txn, item).await?,
                                    Typ::StArtist => update::<StArtist>(txn, item).await?,
                                    Typ::MbzRecording => update::<MbzRecording>(txn, item).await?,
                                    Typ::MbzArtist => update::<MbzArtist>(txn, item).await?,
                                }
                            }
                        }
                        None => {
                            let msg = "No Transaction Active";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        }
                    }
                },
                DbRequest::UpdateMetadata {
                    transaction_id,
                    id,
                    typ,
                    metadata,
                } => {
                    let txn = db.transaction.lock().await;
                    match txn.as_ref() {
                        Some((tid, txn)) => {
                            if *tid != transaction_id {
                                let msg = "Transaction Inactive";
                                MessageResult::Err(ErrorMessage {
                                    message: msg.into(),
                                    stack_trace: msg.into(),
                                })
                            } else {
                                match typ {
                                    Typ::MmSong => update_metadata::<MmSong>(txn, id, metadata).await?,
                                    Typ::MmAlbum => update_metadata::<MmAlbum>(txn, id, metadata).await?,
                                    Typ::MmArtist => update_metadata::<MmArtist>(txn, id, metadata).await?,
                                    Typ::MmPlaylist => update_metadata::<MmPlaylist>(txn, id, metadata).await?,
                                    Typ::MmQueue => update_metadata::<MmQueue>(txn, id, metadata).await?,
                                    Typ::LocalState => update_metadata::<LocalState>(txn, id, metadata).await?,
                                    Typ::Song => update_metadata::<Song>(txn, id, metadata).await?,
                                    Typ::Playlist => update_metadata::<Playlist>(txn, id, metadata).await?,
                                    Typ::Queue => update_metadata::<Queue>(txn, id, metadata).await?,
                                    Typ::ArtistBlacklist => update_metadata::<ArtistBlacklist>(txn, id,metadata).await?,
                                    Typ::SongBlacklist => update_metadata::<SongBlacklist>(txn, id, metadata).await?,
                                    Typ::Updater => update_metadata::<Updater>(txn, id, metadata).await?,
                                    Typ::StSong => update_metadata::<StSong>(txn, id, metadata).await?,
                                    Typ::StAlbum => update_metadata::<StAlbum>(txn, id, metadata).await?,
                                    Typ::StPlaylist => update_metadata::<StPlaylist>(txn, id, metadata).await?,
                                    Typ::StArtist => update_metadata::<StArtist>(txn, id, metadata).await?,
                                    Typ::MbzRecording => update_metadata::<MbzRecording>(txn, id, metadata).await?,
                                    Typ::MbzArtist => update_metadata::<MbzArtist>(txn, id, metadata).await?,
                                }
                            }
                        }
                        None => {
                            let msg = "No Transaction Active";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        }
                    }
                },
                DbRequest::Delete {
                    transaction_id,
                    item,
                } => {
                    let txn = db.transaction.lock().await;
                    match txn.as_ref() {
                        Some((tid, txn)) => {
                            if *tid != transaction_id {
                                let msg = "Transaction Inactive";
                                MessageResult::Err(ErrorMessage {
                                    message: msg.into(),
                                    stack_trace: msg.into(),
                                })
                            } else {
                                match item.typ {
                                    Typ::LocalState => {
                                        let msg = "Operation Not Allowed";
                                        MessageResult::Err(ErrorMessage {
                                            message: msg.into(),
                                            stack_trace: msg.into(),
                                        })
                                    },
                                    Typ::MmSong => delete::<MmSong>(txn, item).await?,
                                    Typ::MmAlbum => delete::<MmAlbum>(txn, item).await?,
                                    Typ::MmArtist => delete::<MmArtist>(txn, item).await?,
                                    Typ::MmPlaylist => delete::<MmPlaylist>(txn, item).await?,
                                    Typ::MmQueue => delete::<MmQueue>(txn, item).await?,
                                    Typ::Song => delete::<Song>(txn, item).await?,
                                    Typ::Playlist => delete::<Playlist>(txn, item).await?,
                                    Typ::Queue => delete::<Queue>(txn, item).await?,
                                    Typ::ArtistBlacklist => delete::<ArtistBlacklist>(txn, item).await?,
                                    Typ::SongBlacklist => delete::<SongBlacklist>(txn, item).await?,
                                    Typ::Updater => delete::<Updater>(txn, item).await?,
                                    Typ::StSong => delete::<StSong>(txn, item).await?,
                                    Typ::StAlbum => delete::<StAlbum>(txn, item).await?,
                                    Typ::StPlaylist => delete::<StPlaylist>(txn, item).await?,
                                    Typ::StArtist => delete::<StArtist>(txn, item).await?,
                                    Typ::MbzRecording => delete::<MbzRecording>(txn, item).await?,
                                    Typ::MbzArtist => delete::<MbzArtist>(txn, item).await?,
                                }
                            }
                        }
                        None => {
                            let msg = "No Transaction Active";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        }
                    }
                },
                DbRequest::Search { typ, query } => {
                    match typ {
                        Typ::MmSong => search::<MmSong>(db, query).await?,
                        Typ::MmAlbum => search::<MmAlbum>(db, query).await?,
                        Typ::MmArtist => search::<MmArtist>(db, query).await?,
                        Typ::MmPlaylist => search::<MmPlaylist>(db, query).await?,
                        Typ::MmQueue => search::<MmQueue>(db, query).await?,
                        Typ::LocalState => search::<LocalState>(db, query).await?,
                        Typ::Song => search::<Song>(db, query).await?,
                        Typ::Playlist => search::<Playlist>(db, query).await?,
                        Typ::Queue => search::<Queue>(db, query).await?,
                        Typ::ArtistBlacklist => search::<ArtistBlacklist>(db, query).await?,
                        Typ::SongBlacklist => search::<SongBlacklist>(db, query).await?,
                        Typ::Updater => search::<Updater>(db, query).await?,
                        Typ::StSong => search::<StSong>(db, query).await?,
                        Typ::StAlbum => search::<StAlbum>(db, query).await?,
                        Typ::StPlaylist => search::<StPlaylist>(db, query).await?,
                        Typ::StArtist => search::<StArtist>(db, query).await?,
                        Typ::MbzRecording => search::<MbzRecording>(db, query).await?,
                        Typ::MbzArtist => search::<MbzArtist>(db, query).await?,
                    }
                },
                DbRequest::GetByRefid { typ, refid } => {
                    match typ {
                        Typ::MmPlaylist |
                        Typ::MmQueue |
                        Typ::MmArtist |
                        Typ::Playlist |
                        Typ::Queue |
                        Typ::ArtistBlacklist |
                        Typ::SongBlacklist |
                        Typ::LocalState => {
                            let msg = "Item does not support Refids";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        },
                        Typ::MmSong => get_by_refid::<MmSong>(db, refid).await?,
                        Typ::MmAlbum => get_by_refid::<MmAlbum>(db, refid).await?,
                        Typ::Song => get_by_refid::<Song>(db, refid).await?,
                        Typ::Updater => get_by_refid::<Updater>(db, refid).await?,
                        Typ::StSong => get_by_refid::<StSong>(db, refid).await?,
                        Typ::StAlbum => get_by_refid::<StAlbum>(db, refid).await?,
                        Typ::StPlaylist => get_by_refid::<StPlaylist>(db, refid).await?,
                        Typ::StArtist => get_by_refid::<StArtist>(db, refid).await?,
                        Typ::MbzRecording => get_by_refid::<MbzRecording>(db, refid).await?,
                        Typ::MbzArtist => get_by_refid::<MbzArtist>(db, refid).await?,
                    }
                },
                DbRequest::GetManyByRefid { typ, refids } => {
                    match typ {
                        Typ::MmPlaylist |
                        Typ::MmQueue |
                        Typ::MmArtist |
                        Typ::Playlist |
                        Typ::Queue |
                        Typ::ArtistBlacklist |
                        Typ::SongBlacklist |
                        Typ::LocalState => {
                            let msg = "Item does not support Refids";
                            MessageResult::Err(ErrorMessage {
                                message: msg.into(),
                                stack_trace: msg.into(),
                            })
                        },
                        Typ::MmSong => get_many_by_refid::<MmSong>(db, refids).await?,
                        Typ::MmAlbum => get_many_by_refid::<MmAlbum>(db, refids).await?,
                        Typ::Song => get_many_by_refid::<Song>(db, refids).await?,
                        Typ::Updater => get_many_by_refid::<Updater>(db, refids).await?,
                        Typ::StSong => get_many_by_refid::<StSong>(db, refids).await?,
                        Typ::StAlbum => get_many_by_refid::<StAlbum>(db, refids).await?,
                        Typ::StPlaylist => get_many_by_refid::<StPlaylist>(db, refids).await?,
                        Typ::StArtist => get_many_by_refid::<StArtist>(db, refids).await?,
                        Typ::MbzRecording => get_many_by_refid::<MbzRecording>(db, refids).await?,
                        Typ::MbzArtist => get_many_by_refid::<MbzArtist>(db, refids).await?,
                    }
                },
                DbRequest::GetById { typ, id } => {
                    match typ {
                        Typ::MmSong => get_by_id::<MmSong>(db, id).await?,
                        Typ::MmAlbum => get_by_id::<MmAlbum>(db, id).await?,
                        Typ::MmArtist => get_by_id::<MmArtist>(db, id).await?,
                        Typ::MmPlaylist => get_by_id::<MmPlaylist>(db, id).await?,
                        Typ::MmQueue => get_by_id::<MmQueue>(db, id).await?,
                        Typ::LocalState => get_by_id::<LocalState>(db, id).await?,
                        Typ::Song => get_by_id::<Song>(db, id).await?,
                        Typ::Playlist => get_by_id::<Playlist>(db, id).await?,
                        Typ::Queue => get_by_id::<Queue>(db, id).await?,
                        Typ::ArtistBlacklist => get_by_id::<ArtistBlacklist>(db, id).await?,
                        Typ::SongBlacklist => get_by_id::<SongBlacklist>(db, id).await?,
                        Typ::Updater => get_by_id::<Updater>(db, id).await?,
                        Typ::StSong => get_by_id::<StSong>(db, id).await?,
                        Typ::StAlbum => get_by_id::<StAlbum>(db, id).await?,
                        Typ::StPlaylist => get_by_id::<StPlaylist>(db, id).await?,
                        Typ::StArtist => get_by_id::<StArtist>(db, id).await?,
                        Typ::MbzRecording => get_by_id::<MbzRecording>(db, id).await?,
                        Typ::MbzArtist => get_by_id::<MbzArtist>(db, id).await?,
                    }
                },
                DbRequest::GetManyById { typ, ids } => {
                    match typ {
                        Typ::MmSong => get_many_by_id::<MmSong>(db, ids).await?,
                        Typ::MmAlbum => get_many_by_id::<MmAlbum>(db, ids).await?,
                        Typ::MmArtist => get_many_by_id::<MmArtist>(db, ids).await?,
                        Typ::MmPlaylist => get_many_by_id::<MmPlaylist>(db, ids).await?,
                        Typ::MmQueue => get_many_by_id::<MmQueue>(db, ids).await?,
                        Typ::LocalState => get_many_by_id::<LocalState>(db, ids).await?,
                        Typ::Song => get_many_by_id::<Song>(db, ids).await?,
                        Typ::Playlist => get_many_by_id::<Playlist>(db, ids).await?,
                        Typ::Queue => get_many_by_id::<Queue>(db, ids).await?,
                        Typ::ArtistBlacklist => get_many_by_id::<ArtistBlacklist>(db, ids).await?,
                        Typ::SongBlacklist => get_many_by_id::<SongBlacklist>(db, ids).await?,
                        Typ::Updater => get_many_by_id::<Updater>(db, ids).await?,
                        Typ::StSong => get_many_by_id::<StSong>(db, ids).await?,
                        Typ::StAlbum => get_many_by_id::<StAlbum>(db, ids).await?,
                        Typ::StPlaylist => get_many_by_id::<StPlaylist>(db, ids).await?,
                        Typ::StArtist => get_many_by_id::<StArtist>(db, ids).await?,
                        Typ::MbzRecording => get_many_by_id::<MbzRecording>(db, ids).await?,
                        Typ::MbzArtist => get_many_by_id::<MbzArtist>(db, ids).await?,
                    }
                },
            };
            Ok(res)
        }
    }
}

pub mod message_server {
    use std::convert::Infallible;
    use std::sync::atomic::{AtomicU32, Ordering};

    use futures::{SinkExt, StreamExt};
    use tokio::sync::mpsc::{self, Sender};
    use tokio_stream::wrappers::ReceiverStream;
    use warp::filters::BoxedFilter;
    use warp::Reply;

    use super::*;

    fn get_id_route(path: &'static str) -> BoxedFilter<(impl Reply,)> {
        let id: Arc<AtomicU32> = Arc::new(0.into());
        let route = warp::path("serve")
            .and(warp::path(path))
            .and(warp::path("new_id"))
            .and(warp::path::end())
            .and(warp::any().map(move || id.clone()))
            .and_then(|id: Arc<AtomicU32>| async move {
                let id = id.fetch_add(1, Ordering::Relaxed);
                Ok::<_, Infallible>(warp::reply::json(&id))
            });

        let route = route.with(warp::cors().allow_any_origin());
        route.boxed()
    }

    fn client_ws_route<R: MessageServerRequest<Ctx = Ctx>, Ctx: Clone + Sync + Send + 'static>(
        path: &'static str,
        ctx: Ctx,
    ) -> BoxedFilter<(impl Reply,)> {
        let ws_route = warp::path("serve")
            .and(warp::path(path))
            .and(warp::path::end())
            .and(warp::ws())
            .and(warp::any().map(move || ctx.clone()))
            .then(|ws: warp::ws::Ws, ctx: Ctx| async move {
                ws.on_upgrade(move |ws| async move {
                    let ctx = ctx.clone();
                    let (mut wstx, mut wsrx) = ws.split();
                    let (tx, rx) = mpsc::channel::<Message<String>>(100);
                    let mut rx = ReceiverStream::new(rx);

                    let j = tokio::task::spawn(async move {
                        while let Some(msg) = rx.next().await {
                            let msg = serde_json::to_string(&msg).unwrap();
                            let msg = warp::ws::Message::text(msg);
                            match wstx.send(msg).await {
                                Ok(_) => (),
                                Err(e) => {
                                    eprintln!(
                                        "Failed to send message using websocket - {}",
                                        e.to_string()
                                    );
                                }
                            }
                        }
                    });

                    async fn message_handler<R: MessageServerRequest<Ctx = Ctx>, Ctx: Clone>(
                        sender: Sender<Message<String>>,
                        msg: warp::ws::Message,
                        ctx: Ctx,
                    ) -> anyhow::Result<()> {
                        let Some(msg) = msg.to_str().ok() else {
                            return Ok(());
                        };
                        let msg = serde_json::from_str::<Message<String>>(msg)?;
                        match msg.id {
                            Some(id) => match msg.data {
                                MessageResult::Ok(data) => {
                                    let req: R = serde_json::from_str(&data)?;
                                    match req.handle(ctx).await {
                                        Ok(res) => {
                                            sender
                                                .send(Message {
                                                    id: Some(id),
                                                    data: res,
                                                })
                                                .await?;
                                        }
                                        Err(err) => {
                                            sender
                                                .send(Message {
                                                    id: Some(id),
                                                    data: MessageResult::Err(ErrorMessage {
                                                        message: format!("{}", err),
                                                        stack_trace: format!("{:?}", err),
                                                    }),
                                                })
                                                .await?;
                                        }
                                    }
                                }
                                MessageResult::Err(err) => {
                                    println!("frontend sent an error: {}", err);
                                }
                            },
                            None => match msg.data {
                                MessageResult::Ok(msg) => {
                                    return Err(anyhow::anyhow!(
                                        "frontend sent a message without id :/ : {:?}",
                                        msg
                                    ));
                                }
                                MessageResult::Err(e) => {
                                    println!("frontend sent an error: {}", e);
                                }
                            },
                        }
                        Ok(())
                    }

                    while let Some(msg) = wsrx.next().await {
                        match msg {
                            Ok(msg) => {
                                let tx = tx.clone();
                                let ctx = ctx.clone();
                                let _j = tokio::task::spawn(async move {
                                    match message_handler::<R, Ctx>(tx, msg, ctx).await {
                                        Ok(_) => (),
                                        Err(e) => {
                                            eprintln!("Error: {}", &e);
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                eprintln!("Error: {}", &e);
                            }
                        }
                    }

                    // NOTE: abort drops everything correctly. so this is fine
                    j.abort();
                })
            });
        let ws_route = ws_route.with(warp::cors().allow_any_origin());
        ws_route.boxed()
    }

    #[async_trait::async_trait]
    pub trait MessageServerRequest
    where
        Self: Sized + Send + Sync + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        type Ctx: Clone + Send + Sync + 'static;

        async fn handle(self, ctx: Self::Ctx) -> anyhow::Result<MessageResult<String>>;

        fn routes(ctx: Self::Ctx, path: &'static str) -> BoxedFilter<(impl Reply,)> {
            client_ws_route::<Self, _>(path, ctx)
                .or(get_id_route(path))
                .boxed()
        }
    }
}

fn source_path_route(path: &'static str, config: Arc<crate::cli::DerivedConfig>) -> warp::filters::BoxedFilter<(impl warp::reply::Reply,)> {
    let route = warp::path(path)
        .and(warp::path::end())
        .and(warp::any().map(move || config.clone()))
        .and(warp::body::json())
        .and_then(|config: Arc<crate::cli::DerivedConfig>, path: crate::covau_types::SourcePath| async move {
            let path = config.to_path(path).map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

fn save_song_route(path: &'static str, ytf: crate::yt::SongTubeFac) -> warp::filters::BoxedFilter<(impl warp::reply::Reply,)> {
    let route = warp::path(path)
        .and(warp::path::end())
        .and(warp::any().map(move || ytf.clone()))
        .and(warp::body::json())
        .and_then(|ytf: crate::yt::SongTubeFac, id: String| async move {
            let name = format!("{}.webm", &id);

            let bytes = ytf.get_song(id).await.map_err(custom_reject)?;

            let dest = ytf.config.music_path.join(&name);
            let mut file = tokio::fs::File::create_new(&dest).await.map_err(custom_reject)?;
            file.write_all(&bytes).await.map_err(custom_reject)?;

            let path = crate::covau_types::SourcePath {
                typ: crate::covau_types::SourcePathType::CovauMusic,
                path: name,
            };

            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

pub async fn start(ip_addr: Ipv4Addr, port: u16, config: Arc<crate::cli::DerivedConfig>) {
    let client = reqwest::Client::new();
    let db_path = config.db_path.join("music.db");
    let db_exists = db_path.exists();
    let db = Db::new(format!("sqlite:{}?mode=rwc", db_path.to_string_lossy()))
        .await
        .expect("cannot connect to database");
    if !db_exists {
        db.init_tables().await.expect("could not init database");
        db.init_state().await.expect("could not init state");

        if let Some(path) = config.musimanager_db_path.as_ref() {
            db.init_musimanager_data(path, config.clone())
                .await
                .expect("could not init musimanager data");
        }
    }

    let yti = FrontendClient::<YtiRequest>::new();
    let fe = FrontendClient::<FeRequest>::new();
    let state = AppState::new();
    let ytf = crate::yt::SongTubeFac::new(yti.clone(), client.clone(), config.clone());

    let options_route = warp::any().and(warp::options()).map(warp::reply).with(
        warp::cors()
            .allow_any_origin()
            .allow_header("content-type")
            .allow_methods(["POST", "GET"]),
    );

    use message_server::MessageServerRequest;

    // TODO: expose db transactions somehow T_T
    let all = FrontendClient::client_ws_route(yti.clone(), "yti")
        .or(FrontendClient::client_ws_route(fe.clone(), "fec"))
        .or(FeRequest::cli_command_route(fe.clone(), "cli"))
        .or(AppState::app_state_handler_route(state.clone(), "app"))
        .or(db_server::DbRequest::routes(db.clone(), "db"))
        .or(crate::server::player::player_route())
        .or(ProxyRequest::cors_proxy_route(client.clone()))
        .or(crate::server::mbz::mbz_routes(client.clone()))
        .or(webui_js_route(client.clone()))
        .or(source_path_route("to_path", config.clone()))
        .or(save_song_route("save_song", ytf.clone()))
        .or(options_route.boxed());
    // let all = all.or(redirect_route(client.clone()));
    let all = all.or(Asset::embedded_asset_route());
    let all = all.recover(|rej: warp::reject::Rejection| async move {
        let msg = if let Some(CustomReject(err)) = rej.find() {
            match err.downcast_ref() {
                Some(ErrorMessage {
                    message,
                    stack_trace,
                }) => warp::reply::json(&ErrorMessage {
                    message: message.into(),
                    stack_trace: stack_trace.into(),
                }),
                None => warp::reply::json(&ErrorMessage {
                    message: format!("{}", err),
                    stack_trace: format!("{:?}", err),
                }),
            }
        } else {
            warp::reply::json(&ErrorMessage {
                message: "server error".into(),
                stack_trace: format!("{:?}", rej),
            })
        };
        let r = warp::reply::with_status(msg, warp::http::StatusCode::INTERNAL_SERVER_ERROR);
        let r = warp::reply::with_header(r, "access-control-allow-origin", "*");

        Result::<_, std::convert::Infallible>::Ok(r)
    });

    let j = tokio::task::spawn(async move {
        let ytf = ytf;
        let db = db;
        let fec = fe;

        updater_system(ytf, fec, db).await;
    });

    println!("Starting server at {}:{}", ip_addr, port);

    if config.run_in_background {
        warp::serve(all).run((ip_addr, port)).await;
    } else {
        tokio::select! {
            _ = warp::serve(all).run((ip_addr, port)) => { },
            _ = state.wait() => { },
        }
    }

    j.abort();
}

async fn _updater_system(
    ytf: crate::yt::SongTubeFac,
    fec: FrontendClient<FeRequest>,
    db: Db,
) -> anyhow::Result<()> {
    let _manager = covau_types::UpdateManager::new(ytf, fec, db);
    // manager.start().await?;
    Ok(())
}

async fn updater_system(
    ytf: crate::yt::SongTubeFac,
    fec: FrontendClient<FeRequest>,
    db: Db,
) {
    match _updater_system(ytf, fec, db).await {
        Ok(()) => (),
        Err(e) => {
            eprintln!("updater error: {}", e);
        }
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    use crate::server::{player::*, routes::*};
    use db_server::*;

    let mut types = String::new();
    types += "import type { DbMetadata } from '$types/db.ts';\n";
    types += ";\n";
    types += &specta::ts::export::<Message<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<MessageResult<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FeRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<AppMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerCommand>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ProxyRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<InsertResponse<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<DbRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ErrorMessage>(config)?;
    types += ";\n";

    Ok(types)
}
