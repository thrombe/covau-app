use sea_orm::ConnectionTrait;
use serde::{Deserialize, Serialize};

use crate::{
    db::{Db, DbAble, DbId, DbItem, DbMetadata, SearchQuery, TransactionId, Typ},
    server::{ErrorMessage, MessageResult},
};

use super::message_server::MessageServerRequest;

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
    GetUntypedById {
        id: DbId,
    },
    GetManyUntypedById {
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
type MmSong =
    crate::musimanager::Song<Option<crate::musimanager::SongInfo>, crate::covau_types::SourcePath>;
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
            let res = db.search_by_ref_id::<T>(refid).await?;
            Ok(MessageResult::Ok(res).json())
        }
        async fn get_many_by_refid<T: DbAble>(
            db: Db,
            refids: Vec<String>,
        ) -> anyhow::Result<MessageResult<String>> {
            let res = db.search_many_by_ref_id::<T>(refids).await?;
            Ok(MessageResult::Ok(res).json())
        }
        async fn get_by_id<T: DbAble>(db: Db, id: DbId) -> anyhow::Result<MessageResult<String>> {
            let res = db.search_by_id::<T>(id).await?;
            Ok(MessageResult::Ok(res).json())
        }
        async fn get_many_by_id<T: DbAble>(
            db: Db,
            ids: Vec<DbId>,
        ) -> anyhow::Result<MessageResult<String>> {
            let res = db.search_many_by_id::<T>(ids).await?;
            Ok(MessageResult::Ok(res).json())
        }
        async fn get_untyped_by_id(db: Db, id: DbId) -> anyhow::Result<MessageResult<String>> {
            let res = db.search_untyped_by_id(id).await?;
            Ok(MessageResult::Ok(res).json())
        }
        async fn get_many_untyped_by_id(
            db: Db,
            ids: Vec<DbId>,
        ) -> anyhow::Result<MessageResult<String>> {
            let res = db.search_many_untyped_by_id(ids).await?;
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
                                }
                                Typ::MmSong => insert::<MmSong>(txn, item).await?,
                                Typ::MmAlbum => insert::<MmAlbum>(txn, item).await?,
                                Typ::MmArtist => insert::<MmArtist>(txn, item).await?,
                                Typ::MmPlaylist => insert::<MmPlaylist>(txn, item).await?,
                                Typ::MmQueue => insert::<MmQueue>(txn, item).await?,
                                Typ::Song => insert::<Song>(txn, item).await?,
                                Typ::Playlist => insert::<Playlist>(txn, item).await?,
                                Typ::Queue => insert::<Queue>(txn, item).await?,
                                Typ::ArtistBlacklist => {
                                    insert::<ArtistBlacklist>(txn, item).await?
                                }
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
            }
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
                                }
                                Typ::MmSong => insert_or_get::<MmSong>(txn, item).await?,
                                Typ::MmAlbum => insert_or_get::<MmAlbum>(txn, item).await?,
                                Typ::MmArtist => insert_or_get::<MmArtist>(txn, item).await?,
                                Typ::MmPlaylist => insert_or_get::<MmPlaylist>(txn, item).await?,
                                Typ::MmQueue => insert_or_get::<MmQueue>(txn, item).await?,
                                Typ::Song => insert_or_get::<Song>(txn, item).await?,
                                Typ::Playlist => insert_or_get::<Playlist>(txn, item).await?,
                                Typ::Queue => insert_or_get::<Queue>(txn, item).await?,
                                Typ::ArtistBlacklist => {
                                    insert_or_get::<ArtistBlacklist>(txn, item).await?
                                }
                                Typ::SongBlacklist => {
                                    insert_or_get::<SongBlacklist>(txn, item).await?
                                }
                                Typ::Updater => insert_or_get::<Updater>(txn, item).await?,
                                Typ::StSong => insert_or_get::<StSong>(txn, item).await?,
                                Typ::StAlbum => insert_or_get::<StAlbum>(txn, item).await?,
                                Typ::StPlaylist => insert_or_get::<StPlaylist>(txn, item).await?,
                                Typ::StArtist => insert_or_get::<StArtist>(txn, item).await?,
                                Typ::MbzRecording => {
                                    insert_or_get::<MbzRecording>(txn, item).await?
                                }
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
                                Typ::ArtistBlacklist => {
                                    update::<ArtistBlacklist>(txn, item).await?
                                }
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
            }
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
                                Typ::MmAlbum => {
                                    update_metadata::<MmAlbum>(txn, id, metadata).await?
                                }
                                Typ::MmArtist => {
                                    update_metadata::<MmArtist>(txn, id, metadata).await?
                                }
                                Typ::MmPlaylist => {
                                    update_metadata::<MmPlaylist>(txn, id, metadata).await?
                                }
                                Typ::MmQueue => {
                                    update_metadata::<MmQueue>(txn, id, metadata).await?
                                }
                                Typ::LocalState => {
                                    update_metadata::<LocalState>(txn, id, metadata).await?
                                }
                                Typ::Song => update_metadata::<Song>(txn, id, metadata).await?,
                                Typ::Playlist => {
                                    update_metadata::<Playlist>(txn, id, metadata).await?
                                }
                                Typ::Queue => update_metadata::<Queue>(txn, id, metadata).await?,
                                Typ::ArtistBlacklist => {
                                    update_metadata::<ArtistBlacklist>(txn, id, metadata).await?
                                }
                                Typ::SongBlacklist => {
                                    update_metadata::<SongBlacklist>(txn, id, metadata).await?
                                }
                                Typ::Updater => {
                                    update_metadata::<Updater>(txn, id, metadata).await?
                                }
                                Typ::StSong => update_metadata::<StSong>(txn, id, metadata).await?,
                                Typ::StAlbum => {
                                    update_metadata::<StAlbum>(txn, id, metadata).await?
                                }
                                Typ::StPlaylist => {
                                    update_metadata::<StPlaylist>(txn, id, metadata).await?
                                }
                                Typ::StArtist => {
                                    update_metadata::<StArtist>(txn, id, metadata).await?
                                }
                                Typ::MbzRecording => {
                                    update_metadata::<MbzRecording>(txn, id, metadata).await?
                                }
                                Typ::MbzArtist => {
                                    update_metadata::<MbzArtist>(txn, id, metadata).await?
                                }
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
                                }
                                Typ::MmSong => delete::<MmSong>(txn, item).await?,
                                Typ::MmAlbum => delete::<MmAlbum>(txn, item).await?,
                                Typ::MmArtist => delete::<MmArtist>(txn, item).await?,
                                Typ::MmPlaylist => delete::<MmPlaylist>(txn, item).await?,
                                Typ::MmQueue => delete::<MmQueue>(txn, item).await?,
                                Typ::Song => delete::<Song>(txn, item).await?,
                                Typ::Playlist => delete::<Playlist>(txn, item).await?,
                                Typ::Queue => delete::<Queue>(txn, item).await?,
                                Typ::ArtistBlacklist => {
                                    delete::<ArtistBlacklist>(txn, item).await?
                                }
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
            }
            DbRequest::Search { typ, query } => match typ {
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
            },
            DbRequest::GetByRefid { typ, refid } => match typ {
                Typ::MmPlaylist
                | Typ::MmQueue
                | Typ::MmArtist
                | Typ::Playlist
                | Typ::Queue
                | Typ::ArtistBlacklist
                | Typ::SongBlacklist
                | Typ::LocalState => {
                    let msg = "Item does not support Refids";
                    MessageResult::Err(ErrorMessage {
                        message: msg.into(),
                        stack_trace: msg.into(),
                    })
                }
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
            },
            DbRequest::GetManyByRefid { typ, refids } => match typ {
                Typ::MmPlaylist
                | Typ::MmQueue
                | Typ::MmArtist
                | Typ::Playlist
                | Typ::Queue
                | Typ::ArtistBlacklist
                | Typ::SongBlacklist
                | Typ::LocalState => {
                    let msg = "Item does not support Refids";
                    MessageResult::Err(ErrorMessage {
                        message: msg.into(),
                        stack_trace: msg.into(),
                    })
                }
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
            },
            DbRequest::GetById { typ, id } => match typ {
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
            },
            DbRequest::GetManyById { typ, ids } => match typ {
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
            },
            DbRequest::GetUntypedById { id } => get_untyped_by_id(db, id).await?,
            DbRequest::GetManyUntypedById { ids } => get_many_untyped_by_id(db, ids).await?,
        };
        Ok(res)
    }
}
