use anyhow::Context;
use serde::{Deserialize, Serialize};
use warp::{filters::BoxedFilter, reply::Reply, Filter};

use crate::db::{Db, DbAble};
use crate::mbz::{self, IdSearch, PagedSearch};
use crate::server::server::custom_reject;

pub fn linked_search<T, A>(
    path: &'static str,
    linked_to: &'static str,
) -> BoxedFilter<(impl Reply,)>
where
    T: mbz::Linked<A> + Serialize + Send + Sized,
{
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("linked"))
        .and(warp::path(linked_to))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: mbz::SearchQuery| async move {
            let res = T::search(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

pub fn mbz_radio_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("radio")
        .and(warp::path::end())
        .and(warp::body::json())
        .and(warp::any().map(move || c.clone()))
        .and_then(|query: String, c: reqwest::Client| async move {
            let res = mbz::listenbrainz::explore(c, query, mbz::listenbrainz::Mode::Easy)
                .await
                .map_err(custom_reject)?;
            let res = match res {
                mbz::listenbrainz::QueryResult::Ok { payload } => payload.jspf.playlist.track,
                mbz::listenbrainz::QueryResult::Err { error, .. } => {
                    return Err(custom_reject(anyhow::anyhow!(error)));
                }
            };
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct WithTransaction<T> {
    transaction_id: u32,
    t: T,
}

fn db_begin_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("begin"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and_then(|db: Db| async move {
            // let id = db.begin().await.map_err(custom_reject)?;
            // Ok::<_, warp::Rejection>(warp::reply::json(&id))
            todo!();
            Ok::<_, warp::Rejection>(warp::reply())
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

fn db_commit_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("commit"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, id: u32| async move {
            // db.commit(id).await.map_err(custom_reject)?;
            // Ok::<_, warp::Rejection>(warp::reply())
            todo!();
            Ok::<_, warp::Rejection>(warp::reply())
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

fn db_rollback_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("rollback"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, id: u32| async move {
            // db.rollback(id).await.map_err(custom_reject)?;
            // Ok::<_, warp::Rejection>(warp::reply())
            todo!();
            Ok::<_, warp::Rejection>(warp::reply())
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

// #[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
// #[serde(tag = "type", content = "content")]
// pub enum InsertResponse<T> {
//     New(T),
//     Old(T),
// }
fn db_insert_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let insert = warp::path("insert")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, item: WithTransaction<T>| async move {
            // let old = item.t.get_by_refid(&db.db).await.map_err(custom_reject)?;
            // match old {
            //     Some(e) => Ok(warp::reply::json(&InsertResponse::Old(e))),
            //     None => {
            //         let txns = db.transactions.lock().await;
            //         let txn = txns
            //             .get(&item.transaction_id)
            //             .context("Transaction not found")
            //             .map_err(custom_reject)?;
            //         let id = item.t.insert(txn).await.map_err(custom_reject)?;
            //         let db_item = crate::db::DbItem {
            //             id,
            //             typ: T::typ(),
            //             t: item,
            //             metadata: crate::db::DbMetadata::new(),
            //         };
            //         Ok::<_, warp::Rejection>(warp::reply::json(&InsertResponse::New(db_item)))
            //     }
            // }
            todo!();
            Ok::<_, warp::Rejection>(warp::reply())
        });
    let insert = insert.with(warp::cors().allow_any_origin());
    insert.boxed()
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct UpdateMetadataQuery {
    id: crate::db::DbId,
    metadata: crate::db::DbMetadata,
}
fn db_update_metadata_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let update = warp::path("update_metadata")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(
            |db: Db, q: WithTransaction<UpdateMetadataQuery>| async move {
                // let txns = db.transactions.lock().await;
                // let txn = txns
                //     .get(&q.transaction_id)
                //     .context("Transaction not found")
                //     .map_err(custom_reject)?;
                // let mdata = T::update_mdata(txn, q.t.id, q.t.metadata)
                //     .await
                //     .map_err(custom_reject)?;
                // Ok::<_, warp::Rejection>(warp::reply::json(&mdata))
                todo!();
                Ok::<_, warp::Rejection>(warp::reply())
            },
        );
    let update = update.with(warp::cors().allow_any_origin());
    update.boxed()
}

fn db_update_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let update = warp::path("update")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(
            |db: Db, item: WithTransaction<crate::db::DbItem<T>>| async move {
                // let txns = db.transactions.lock().await;
                // let txn = txns
                //     .get(&item.transaction_id)
                //     .context("Transaction not found")
                //     .map_err(custom_reject)?;
                // let mdata = item.t.update(txn).await.map_err(custom_reject)?;

                // let mut item = item.t;
                // item.metadata = mdata;
                // Ok::<_, warp::Rejection>(warp::reply::json(&item))
                todo!();
                Ok::<_, warp::Rejection>(warp::reply())
            },
        );
    let update = update.with(warp::cors().allow_any_origin());
    update.boxed()
}

fn db_delete_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let delete = warp::path("delete")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(
            |db: Db, item: WithTransaction<crate::db::DbItem<T>>| async move {
                // let txns = db.transactions.lock().await;
                // let txn = txns
                //     .get(&item.transaction_id)
                //     .context("Transaction not found")
                //     .map_err(custom_reject)?;
                // item.t.delete(txn).await.map_err(custom_reject)?;
                // Ok::<_, warp::Rejection>(warp::reply())
                todo!();
                Ok::<_, warp::Rejection>(warp::reply())
            },
        );
    let delete = delete.with(warp::cors().allow_any_origin());
    delete.boxed()
}

fn db_search_route<T: DbAble + Send>(db: Db, path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: crate::db::SearchQuery| async move {
            let res = db.search::<T>(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_many_by_refid_route<T: DbAble + Send>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("refids"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<String>| async move {
            let res = db
                .search_many_by_ref_id::<T>(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_by_refid_route<T: DbAble + Send>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("refid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, refid: String| async move {
            let res = db
                .search_by_ref_id::<T>(refid)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_by_id_route<T: DbAble + Send>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("dbid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<crate::db::DbId>| async move {
            let res = db
                .search_many_by_id::<T>(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_untyped_by_id_route(db: Db, path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("dbid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<crate::db::DbId>| async move {
            let res = db
                .search_many_untyped_by_id(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn paged_search<T: PagedSearch + Serialize + Send>(
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: mbz::SearchQuery| async move {
            let res = T::search(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn id_search<T: IdSearch + Serialize + Send>(path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("id"))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: String| async move {
            let res = T::get(&query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

pub fn db_routes(db: Db, client: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    let musimanager_search_routes = {
        use crate::musimanager::*;

        warp::path("musimanager").and(
            db_search_route::<Song<Option<SongInfo>>>(db.clone(), "songs")
                .or(db_search_many_by_refid_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_by_refid_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_by_id_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_insert_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_update_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_update_metadata_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_delete_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_search_many_by_refid_route::<Album<VideoId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_search_by_refid_route::<Album<VideoId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_search_by_id_route::<Album<VideoId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_insert_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_update_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_update_metadata_route::<Album<VideoId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_delete_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_search_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_by_id_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_insert_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_update_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_update_metadata_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_delete_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_id_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_insert_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_update_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_update_metadata_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_delete_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue<VideoId>>(
                    db.clone(),
                    "queues",
                ))
                .or(db_insert_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_update_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_update_metadata_route::<Queue<VideoId>>(
                    db.clone(),
                    "queues",
                ))
                .or(db_delete_route::<Queue<VideoId>>(db.clone(), "queues")),
        )
    };

    let song_tube_search_routes = {
        use crate::yt::song_tube::*;

        warp::path("song_tube").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_many_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_insert_route::<Song>(db.clone(), "songs"))
                .or(db_update_route::<Song>(db.clone(), "songs"))
                .or(db_update_metadata_route::<Song>(db.clone(), "songs"))
                .or(db_delete_route::<Song>(db.clone(), "songs"))
                .or(db_search_route::<Album>(db.clone(), "albums"))
                .or(db_search_many_by_refid_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_refid_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_id_route::<Album>(db.clone(), "albums"))
                .or(db_insert_route::<Album>(db.clone(), "albums"))
                .or(db_update_route::<Album>(db.clone(), "albums"))
                .or(db_update_metadata_route::<Album>(db.clone(), "albums"))
                .or(db_delete_route::<Album>(db.clone(), "albums"))
                .or(db_search_route::<Artist>(db.clone(), "artists"))
                .or(db_search_many_by_refid_route::<Artist>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_by_refid_route::<Artist>(db.clone(), "artists"))
                .or(db_search_by_id_route::<Artist>(db.clone(), "artists"))
                .or(db_insert_route::<Artist>(db.clone(), "artists"))
                .or(db_update_route::<Artist>(db.clone(), "artists"))
                .or(db_update_metadata_route::<Artist>(db.clone(), "artists"))
                .or(db_delete_route::<Artist>(db.clone(), "artists"))
                .or(db_search_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_metadata_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_many_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_id_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_metadata_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists")),
        )
    };

    let covau_search_routes = {
        use crate::covau_types::*;

        warp::path("covau").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_many_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_insert_route::<Song>(db.clone(), "songs"))
                .or(db_update_route::<Song>(db.clone(), "songs"))
                .or(db_update_metadata_route::<Song>(db.clone(), "songs"))
                .or(db_delete_route::<Song>(db.clone(), "songs"))
                .or(db_search_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_many_by_refid_route::<Updater>(
                    db.clone(),
                    "updaters",
                ))
                .or(db_search_by_refid_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_by_id_route::<Updater>(db.clone(), "updaters"))
                .or(db_insert_route::<Updater>(db.clone(), "updaters"))
                .or(db_update_route::<Updater>(db.clone(), "updaters"))
                .or(db_update_metadata_route::<Updater>(db.clone(), "updaters"))
                .or(db_delete_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_many_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_id_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_metadata_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_route::<Queue>(db.clone(), "queues"))
                .or(db_search_many_by_refid_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_refid_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue>(db.clone(), "queues"))
                .or(db_insert_route::<Queue>(db.clone(), "queues"))
                .or(db_update_route::<Queue>(db.clone(), "queues"))
                .or(db_update_metadata_route::<Queue>(db.clone(), "queues"))
                .or(db_delete_route::<Queue>(db.clone(), "queues")),
        )
    };

    let mbz_search_routes = {
        use crate::mbz::*;
        use musicbrainz_rs::entity::{artist, release, release_group};

        warp::path("mbz").and(
            mbz_radio_route(client.clone())
                .or(paged_search::<ReleaseWithInfo>("releases_with_info"))
                .or(id_search::<ReleaseWithInfo>("releases_with_info"))
                .or(paged_search::<ReleaseGroupWithInfo>(
                    "release_groups_with_info",
                ))
                .or(id_search::<ReleaseGroupWithInfo>(
                    "release_groups_with_info",
                ))
                .or(paged_search::<Artist>("artists"))
                .or(id_search::<Artist>("artists"))
                .or(id_search::<WithUrlRels<Artist>>("artist_with_urls"))
                .or(paged_search::<RecordingWithInfo>("recordings_with_info"))
                .or(id_search::<RecordingWithInfo>("recordings_with_info"))
                .or(linked_search::<ReleaseGroup, artist::Artist>(
                    "release_groups",
                    "artist",
                ))
                .or(linked_search::<Release, artist::Artist>(
                    "releases", "artist",
                ))
                .or(linked_search::<Release, release_group::ReleaseGroup>(
                    "releases",
                    "release_group",
                ))
                .or(linked_search::<Recording, artist::Artist>(
                    "recordings",
                    "artist",
                ))
                .or(linked_search::<Recording, release::Release>(
                    "recordings",
                    "release",
                )),
        )
    };

    let all = musimanager_search_routes
        .boxed()
        .or(song_tube_search_routes.boxed())
        .or(covau_search_routes.boxed())
        .or(mbz_search_routes.boxed())
        .or(db_begin_transaction_route(db.clone()))
        .or(db_commit_transaction_route(db.clone()))
        .or(db_rollback_transaction_route(db.clone()))
        .or(db_search_untyped_by_id_route(db.clone(), "object"));
    all.boxed()
}
