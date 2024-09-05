use serde::Serialize;
use warp::{filters::BoxedFilter, reply::Reply, Filter};

use crate::mbz::{self, IdSearch, PagedSearch};
use crate::server::custom_reject;

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

pub fn mbz_routes(client: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
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

    mbz_search_routes.boxed()
}
