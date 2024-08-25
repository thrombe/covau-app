<script lang="ts">
    import { new_innertube_instance } from "$lib/searcher/tube";
    import { SongTube, YT, YTNodes } from "$lib/searcher/song_tube";
    import { Musiplayer } from "$lib/local/player";
    import type { SearchQuery, SearchMatches } from "$types/db.ts";
    import type { AlbumId, Artist, Song, SongId, SongInfo } from "$types/musimanager.ts";
    import  * as Db from "$lib/searcher/db.ts";
    import type { WrappedDb } from "$lib/searcher/searcher.ts";
    import * as Mbz from "$lib/searcher/mbz.ts";

    let params: { group?: string } = {};

    const dothis = async () => {
        {
            // let p = await new_innertube_instance();
            // let res = await p.music.search("Aimer", { type: 'song' });
            // console.log(res)
            // let contents = res.contents!
            //     .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);
            // let v = contents[0];
            // console.log(v)

            // let d = await p.getInfo(v.id!);
            // console.log(d)
            // let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
            // let url = d.getStreamingInfo();
            // console.log(url, url, f, f.decipher(p.session.player))

            // let lp = new LocalPlayer();
        }

        {
            // let itube = await new_innertube_instance();
            // let fac = SongTube.factory(itube);
            // let ntube = await fac.search_query({ query_type: 'home-feed' });
            // let tube = ntube!;
            // // console.log(await tube.next_page())
            // // tube.test();

            // let adb = Db.Db.unwrapped<Db.Artist>({ query_type: "search", type: "MusimanagerArtist", query: "arjit" }, 10);
            // if (!adb) {
            //     return;
            // }

            // let a = await adb.next_page();
            // console.log(a);
            // let sdb = Db.Db.unwrapped<Db.Song>({ query_type: "songs", ids: a[0].unexplored_songs ?? [] }, 10);
            // if (!sdb) {
            //     return;
            // }
            // let s = await sdb.next_page();
            // console.log(s);

            // let player = new Musiplayer();
            // let i = 5;
            // const play_next = async () => {
            //     if (i >= s.length) {
            //         return;
            //     }

            //     let d = await itube.getInfo(s[i].key);
            //     console.log(d)
            //     let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
            //     let url = d.getStreamingInfo();
            //     let uri = f.decipher(itube.session.player);
            //     player.play(uri);

            //     i += 1;
            // };
            // player.add_message_listener('Finished', play_next);
            // await play_next();
        }

        {
            let searcher = Mbz.Mbz.new({
                query_type: "search",
                query: "artist:milet",
                type: "MbzRecording",
            }, 10);
            let res = await searcher.next_page();
            console.log(res);
            let res3 = await searcher.next_page();
            console.log(res3);
            // let s2 = Mbz.Mbz.new({
            //     query_type: "id",
            //     type: "MbzArtist",
            //     id: res[1].data.id,
            // }, 1);
            // let r4 = await s2.get();
            // console.log(r4)
        }
    };
    dothis();

    let group: string;
    if (!params.group) {
        group = "random-one";
        params.group = group;
    } else {
        group = params.group;
    }

    $: if (group != params.group) {
        let url_without_hash = window.location
            .toString()
            .replace(window.location.hash, "");
        let new_url = url_without_hash + "#/play/" + params.group;
    }
</script>

<div> lmao </div>
