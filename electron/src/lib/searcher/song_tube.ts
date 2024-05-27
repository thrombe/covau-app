import Innertube, { MusicShelfContinuation, UniversalCache, YTMusic, YT, YTNodes, Misc } from "youtubei.js/web";
import { SavedSearch, SlowSearch, UniqueSearch, Unpaged } from "./mixins";
import type { Keyed, RObject, RSearcher } from "./searcher";

export { YT, YTNodes, YTMusic };
export type Search = YTMusic.Search;
export type Playlist = YTMusic.Playlist;
export type SearchContinuation = Awaited<ReturnType<typeof YTMusic.Search.prototype.getContinuation>>;
export type MusicResponsiveListItem = YTNodes.MusicResponsiveListItem;
export type VideoInfo = YT.VideoInfo;

// https://github.com/LuanRT/YouTube.js/issues/321
export type Typ = 'song' | 'video' | 'album' | 'playlist' | 'artist';
export type SearchTyp =
    { type: 'search', search: Typ } |
    { type: 'artist', id: string } |
    { type: 'album', id: string } |
    { type: 'playlist', id: string } |
    { type: 'up-next', id: string };

export type MusicListItemAuthor = { name: string, channel_id: string | null };
export type MusicListItem = {
    type: 'song',
    id: string,
    title: string | null,
    thumbnail: string | null,
    authors: MusicListItemAuthor[],
} | {
    type: 'video',
    id: string,
    title: string | null,
    thumbnail: string | null,
    authors: MusicListItemAuthor[],
} | {
    type: 'album',
    id: string,
    title: string | null,
    thumbnail: string | null,
    author: MusicListItemAuthor | null,
} | {
    type: 'playlist',
    id: string,
    title: string | null,
    thumbnail: string | null,
    author: MusicListItemAuthor | null,
} | {
    type: 'artist',
    id: string,
    name: string | null,
    subscribers: string | null,
    thumbnail: string | null,
};

export class SongTube extends Unpaged<MusicListItem> {
    tube: Innertube;
    type: SearchTyp;

    constructor(q: string, tube: Innertube, type: SearchTyp) {
        super(q);
        this.tube = tube;
        this.type = type;
    }

    static new(q: string, tube: Innertube, type: SearchTyp) {
        const US = UniqueSearch<MusicListItem, typeof SongTube>(SongTube);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        return new SS(q, tube, type);
    }

    // TODO: type is only used for with_query
    static factory(tube: Innertube, type: Typ) {
        type R = RSearcher<MusicListItem>;
        class Fac {
            tube: Innertube;
            constructor(tube: Innertube) {
                this.tube = tube;
            }
            async with_query(q: string) {
                let t = SongTube.new(q, this.tube, { type: 'search', search: type });
                return t as R | null;
            }
            async browse_artist_songs(artist_id: string) {
                let t = SongTube.new('', this.tube, { type: 'artist', id: artist_id });
                return t;
            }
            async browse_album(album_id: string) {
                let t = SongTube.new('', this.tube, { type: 'album', id: album_id });
                return t;
            }
            async browse_playlist(playlist_id: string) {
                let t = SongTube.new('', this.tube, { type: 'playlist', id: playlist_id });
                return t;
            }
            async browse_up_next(song_id: string) {
                let t = SongTube.new('', this.tube, { type: 'up-next', id: song_id });
                return t;
            }
        }
        const SS = SlowSearch<R, typeof Fac>(Fac);
        return new SS(tube);
    }

    static obj_type() {
        return null as unknown as MusicListItem & Keyed;
    }


    results: Search | null = null;
    cont: SearchContinuation | null = null;
    pages: Array<MusicShelfContinuation> = new Array();
    async next_page() {
        if (!this.has_next_page) {
            return [];
        }
        console.log(this.type);
        if (this.type.type == 'search') {
            return await this.next_page_search(this.type.search);
        } else if (this.type.type == 'artist') {
            let r = await this.next_page_artist_songs(this.type.id);
            console.log(r);
            return r;
        } else if (this.type.type == 'album') {
            let r = await this.next_page_album(this.type.id);
            return r;
        } else if (this.type.type == 'playlist') {
            let r = await this.next_page_playlist(this.type.id);
            return r;
        } else if (this.type.type == 'up-next') {
            let r = await this.next_page_up_next(this.type.id);
            return r;
        }

        throw 'unreachable';
    }
    protected async next_page_up_next(video_id: string) {
        this.has_next_page = false;
        let r = await this.tube.music.getUpNext(video_id);
        let k = r.contents.filterType(YTNodes.PlaylistPanelVideo);

        let mli: MusicListItem[] = k.map(s => ({
            type: 'song',
            id: s.video_id,
            title: s.title.text ?? '',
            thumbnail: this.get_thumbnail(s.thumbnail),
            authors: s.artists?.map(a => ({ name: a.name, channel_id: a.channel_id?? null})) ?? [],
        }));
        return keyed(mli);
    }
    playlist: Playlist | null = null;
    protected async next_page_playlist(playlist_id: string) {
        if (!this.playlist) {
            this.playlist = await this.tube.music.getPlaylist(playlist_id);
        } else {
            this.playlist = await this.playlist.getContinuation();
        }
        this.has_next_page = this.playlist.has_continuation;

        let a = this.playlist.items;
        if (!a || a.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let arr = a.filterType(YTNodes.MusicResponsiveListItem);

        let mli: MusicListItem[] = arr.map(p => ({
            type: 'song',
            id: p.id!,
            title: p.title?? null,
            thumbnail: this.get_thumbnail(p.thumbnail),
            authors: p.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
        }));
        return keyed(mli);
    }
    protected async next_page_album(album_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getAlbum(album_id);
        let mli: MusicListItem[] = a.contents.map(a => ({
            type: 'song',
            id: a.id!,
            title: a.title?? null,
            thumbnail: this.get_thumbnail(a.thumbnail),
            authors: a.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
        }));
        return keyed(mli);
    }
    protected async next_page_artist_songs(artist_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getArtist(artist_id);
        let r = await a.getAllSongs();
        let arr: MusicResponsiveListItem[];
        if (!r) {
            arr = [];
        } else {
            arr = r.contents;
        }

        let mli: MusicListItem[] = arr.map(e => ({
            type: 'song',
            id: e.id!,
            title: e.title ?? null,
            thumbnail: this.get_thumbnail(e.thumbnail),
            authors: e.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
        }));
        return keyed(mli);
    }
    protected async next_page_search(type: Exclude<Typ, 'up-next'>) {
        if (this.query.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let songs: Array<MusicResponsiveListItem>;
        if (this.results === null) {
            this.results = await this.tube.music.search(this.query, { type: type });
            console.log(this.results);

            if (!this.results.contents) {
                this.has_next_page = false;
                return [];
            }

            let contents = this.results.contents
                .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);

            songs = contents;
        } else {
            if (this.cont === null) {
                this.cont = await this.results.getContinuation();
            } else {
                if (this.cont.has_continuation) {
                    this.cont = await this.cont.getContinuation();
                } else {
                    this.cont = null;
                }
            }
            console.log(this.cont)

            if (
                !this.cont
                || !this.cont.contents
                || !this.cont.contents.contents
                || !(this.cont.contents.contents.length > 0)
            ) {
                this.has_next_page = false;
                return [];
            }

            songs = [...this.cont.contents.contents.as(YTNodes.MusicResponsiveListItem)];
        }

        songs = songs.filter(e => !!e.id);

        
        let mli: MusicListItem[] = songs.map(e => {
            if (e.item_type === 'song' || e.item_type === 'video') {
                return  {
                    type: 'song',
                    id: e.id!,
                    title: e.title ?? null,
                    thumbnail: this.get_thumbnail(e.thumbnail),
                    authors: e.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
                }
            } else if (e.item_type === 'album' || e.item_type === 'playlist') {
                return  {
                    type: e.item_type,
                    id: e.id!,
                    title: e.title ?? null,
                    thumbnail: this.get_thumbnail(e.thumbnail),
                    author: e.author ? { name: e.author.name, channel_id: e.author?.channel_id ?? null } : null,
                }
            } else if (e.item_type === 'artist') {
                return  {
                    type: 'artist',
                    id: e.id!,
                    name: e.name ?? null,
                    thumbnail: this.get_thumbnail(e.thumbnail),
                    subscribers: e.subscribers ?? null,
                }
            } else {
                return {
                    type: 'video',
                    id: e.id!,
                    title: e.title ?? null,
                    thumbnail: this.get_thumbnail(e.thumbnail),
                    authors: [],
                };
            }
        });
        let k = keyed(mli);

        this.has_next_page = this.results.has_continuation;
        console.log(k.map(e => e.id))
        return k;
    }

    get_thumbnail(node: Misc.Thumbnail[] | YTNodes.MusicThumbnail | null | undefined): MusicListItem['thumbnail'] | null {
        if (node === null || !node) {
            return null;
        }

        let t;
        if (node instanceof YTNodes.MusicThumbnail) {
            t = node.contents.map(t => t.url);
        } else {
            t = node.map(t => t.url);
        }

        return [...t, null][0];
    }

    get_key(t: RObject<MusicListItem>) {
        if (!t.id) {
            console.warn("item does not have an id :/", t);
        }
        return t.id;
    }
}

const keyed = <T extends { id?: any }>(items: T[]): (T & Keyed)[] => {
    let res = items.filter((e: any) => !!e.id).map((e: any) => {
        let p = e as T & Keyed;
        p.get_key = function() {
            if (!p.id) {
                console.warn("item does not have an id :/", p);
            }
            return p.id;
        };
        return p;
    });

    return res;
}
