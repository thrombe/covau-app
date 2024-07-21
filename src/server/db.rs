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
                .or(db_search_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_by_id_route::<Artist<VideoId, AlbumId>>(
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
                .or(db_search_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue<VideoId>>(
                    db.clone(),
                    "queues",
                ))
        )
    };

    let song_tube_search_routes = {
        use crate::yt::song_tube::*;

        warp::path("song_tube").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_many_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_search_route::<Album>(db.clone(), "albums"))
                .or(db_search_many_by_refid_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_refid_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_id_route::<Album>(db.clone(), "albums"))
                .or(db_search_route::<Artist>(db.clone(), "artists"))
                .or(db_search_many_by_refid_route::<Artist>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_by_refid_route::<Artist>(db.clone(), "artists"))
                .or(db_search_by_id_route::<Artist>(db.clone(), "artists"))
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
        )
    };

    let covau_search_routes = {
        use crate::covau_types::*;

        warp::path("covau").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_many_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_search_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_many_by_refid_route::<Updater>(
                    db.clone(),
                    "updaters",
                ))
                .or(db_search_by_refid_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_by_id_route::<Updater>(db.clone(), "updaters"))
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
                .or(db_search_route::<Queue>(db.clone(), "queues"))
                .or(db_search_many_by_refid_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_refid_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue>(db.clone(), "queues"))
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
        .or(db_search_untyped_by_id_route(db.clone(), "object"));
    all.boxed()
}
