"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-use-before-define */
const Hoek = require("@hapi/hoek");
const Schema = require("./schema");
const { hasOwnProperty } = Object.prototype;
function defaults(node, base = {}) {
    if (typeof node === 'object' && (Array.isArray(base) === Array.isArray(node))) {
        return Hoek.merge(Hoek.clone(base), Hoek.clone(node));
    }
    return node;
}
function isValue(node) {
    return !node ||
        typeof node !== 'object' ||
        (!node.$filter && !node.$value);
}
function isSimple(node) {
    return !node || typeof node !== 'object';
}
function coerce(value, type) {
    let result = value;
    switch (type) {
        case 'number': {
            const num = Number(value);
            result = isNaN(num) ? undefined : num;
            break;
        }
    }
    return result;
}
// Return node or value if no filter, otherwise apply filters until node or value
function internalsFilter(node, criteria, applied) {
    if (isValue(node)) {
        return node;
    }
    if (node.$value) {
        return defaults(internalsFilter(node.$value, criteria, applied), node.$base);
    }
    // Filter
    const filter = node.$filter;
    const criterion = typeof filter === 'object'
        ? Hoek.reach(process.env, filter.$env)
        : Hoek.reach(criteria, filter);
    if (criterion !== undefined) {
        if (node.$range) {
            for (let i = 0; i < node.$range.length; ++i) {
                if (criterion <= node.$range[i].limit) {
                    Store._logApplied(applied, filter, node, node.$range[i]);
                    return internalsFilter(node.$range[i].value, criteria, applied);
                }
            }
        }
        else if (node[criterion] !== undefined) {
            Store._logApplied(applied, filter, node, criterion);
            return defaults(internalsFilter(node[criterion], criteria, applied), node.$base);
        }
        // Falls-through for $default
    }
    if (hasOwnProperty.call(node, '$default')) {
        Store._logApplied(applied, filter, node, '$default');
        return defaults(internalsFilter(node.$default, criteria, applied), node.$base);
    }
    Store._logApplied(applied, filter, node);
    return undefined;
}
function getNode(tree, key, criteria, applied) {
    criteria = criteria || {};
    const path = [];
    if (key !== '/') {
        const invalid = key.replace(/\/(\w+)/g, (_, $1) => {
            path.push($1);
            return '';
        });
        if (invalid) {
            return undefined;
        }
    }
    let node = internalsFilter(tree, criteria, applied);
    for (let i = 0; i < path.length && node; ++i) {
        if (typeof node !== 'object') {
            node = undefined;
            break;
        }
        node = internalsFilter(node[path[i]], criteria, applied);
    }
    return node;
}
// Applies criteria on an entire tree
function walk(node, criteria, applied) {
    if (isSimple(node)) {
        return node;
    }
    if (hasOwnProperty.call(node, '$value')) {
        return walk(node.$value, criteria, applied);
    }
    if (hasOwnProperty.call(node, '$param')) {
        const value = Hoek.reach(criteria, node.$param);
        // Falls-through for $default
        if ((typeof value === 'undefined' || value === null) &&
            node.$default) {
            return walk(node.$default, criteria, applied);
        }
        return value;
    }
    if (hasOwnProperty.call(node, '$env')) {
        const value = coerce(Hoek.reach(process.env, node.$env), node.$coerce || 'string');
        // Falls-through for $default
        if (typeof value === 'undefined' && node.$default) {
            return walk(node.$default, criteria, applied);
        }
        return value;
    }
    if (Array.isArray(node)) {
        const parent = [];
        for (let i = 0; i < node.length; i += 1) {
            const child = internalsFilter(node[i], criteria, applied);
            const value = walk(child, criteria, applied);
            if (value !== undefined) {
                parent.push(value);
            }
        }
        return parent;
    }
    const parent = Object.create(null);
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (key === '$meta') {
            continue;
        }
        const child = internalsFilter(node[key], criteria, applied);
        const value = walk(child, criteria, applied);
        if (value !== undefined) {
            parent[key] = value;
        }
    }
    return parent;
}
class Store {
    constructor(document) {
        this.load(document || {});
    }
    load(document) {
        const err = Store.validate(document);
        Hoek.assert(!err, err);
        this._tree = Hoek.clone(document);
    }
    get(key, criteria, applied) {
        const node = getNode(this._tree, key, criteria, applied);
        return walk(node, criteria, applied);
    }
    meta(key, criteria) {
        const node = getNode(this._tree, key, criteria);
        return (typeof node === 'object' ? node.$meta : undefined);
    }
    // Validate tree structure
    static validate(node) {
        const { error } = Schema.store.validate(node, { abortEarly: false });
        return error || null;
    }
    static _logApplied(applied, filter, node, criterion) {
        if (!applied) {
            return;
        }
        const record = { filter };
        if (criterion) {
            if (typeof criterion === 'object') {
                if (criterion.id) {
                    record.valueId = criterion.id;
                }
                else {
                    record.valueId = (typeof criterion.value === 'object' ? '[object]' : criterion.value.toString());
                }
            }
            else {
                record.valueId = criterion.toString();
            }
        }
        if (node && node.$id) {
            record.filterId = node.$id;
        }
        applied.push(record);
    }
}
exports.Store = Store;
exports.default = Store;
//# sourceMappingURL=store.js.map