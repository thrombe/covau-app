import * as types from "$types/types.ts";
import * as utils from './utils.ts';
import * as server from './server.ts';

class RefStore {
    store = new Map<number, RcItem<types.db.DbItem<unknown>>>();
    registry = new FinalizationRegistry((id: number) => {
        let rs = this.store.get(id) ?? null;
        if (rs == null) {
            throw new Error(`item with id ${id} is not in store`);
        }

        rs.free();
    });

    rc<T extends types.db.DbItem<unknown>>(t: T): Rc<T> {
        let k = this.store.get(t.id) ?? null;
        if (k != null) {
            if (k.t.metadata.update_counter >= t.metadata.update_counter) {
                return k.rc() as Rc<T>;
            } else {
                k.t = t;
                return k.rc() as Rc<T>;
            }
        }

        let rs = new RcItem(t);
        this.store.set(t.id, rs);
        return rs.rc();
    }
}
let store = new RefStore();

// refrence store
class RcItem<T extends types.db.DbItem<unknown>> {
    _t: utils.DRo<T>;
    count: number;
    constructor(t: T) {
        this._t = utils.deep_freeze(t);
        this.count = 0;
    }

    get t(): utils.DRo<T> {
        return this._t;
    }

    set t(t: T) {
        this._t = utils.deep_freeze(t);
    }

    free() {
        this.count -= 1;
        if (this.count > 0) {
            return false;
        }

        if (!store.store.delete(this.t.id)) {
            throw new Error(`item with id ${this.t.id} is not in store`);
        }

        // console.log("delete", this.t.id, this.t);
        return true;
    }

    rc() {
        this.count += 1;
        let r = new Rc<T>(this.t.id);
        store.registry.register(r, this.t.id, r);
        // console.log("rc", this.t.id, this.count, store.store.size);
        return r;
    }
}

// refrence counter
export class Rc<T extends types.db.DbItem<unknown>> {
    id: number;
    constructor(id: number) {
        this.id = id;
    }

    get t(): utils.DRo<T> {
        let item = store.store.get(this.id) ?? null;
        if (item == null) {
            throw new Error(`item with id ${this.id} is not in store`);
        }
        return item.t as utils.DRo<T>;
    }

    set t(t: T) {
        if (this.id != t.id) {
            throw new Error(`attempt to assign ${t.id} in Rc for ${this.id}`);
        }
        let item = store.store.get(this.id) ?? null;
        if (item == null) {
            throw new Error(`item with id ${this.id} is not in store`);
        }
        if (item.t.metadata.update_counter >= t.metadata.update_counter) {
            throw new Error("new update_counter must be greater than old update_counter for the DbItem");
        }
        item.t = t;
    }

    cloned(): T {
        let t = this.t;
        return utils.clone(t) as T;
    }

    async txn(fn: (t: T) => Promise<T>, dbops: server.DbOps | null = null) {
        let t = this.cloned();
        t = await fn(t);
        if (dbops == null) {
            t = await server.db.txn(async dbops => {
                return await dbops.update(t);
            }) as T;
        } else {
            t = await dbops.update(t) as T;
        }
        this.t = t;
    }
}

export type DbRc<T> = Rc<types.db.DbItem<T>>;

export const rc = {
    store,
};

