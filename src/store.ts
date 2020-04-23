/* eslint-disable @typescript-eslint/no-use-before-define */
import Hoek = require('@hapi/hoek');
import * as Schema from './schema'

const { hasOwnProperty } = Object.prototype

export interface Criteria {
    [key: string]: any;
}

export interface Applied {
    valueId?: string;
    filterId?: string;
    filter?: Filter;
}

export type Criterion = string | number | undefined;

export type Filter = string | { $env: string }

export interface Range<T> {
    limit: number;
    value: T;
    id?: string;
}

export interface Node<Contents = any> {
    $id?: string;
    $value?: Contents;
    $base?: Contents;  
    $filter?: Filter;
    $range?: Range<Contents>[];
    $env?: string;
    $coerce?: 'number' | 'string';
    $default?: Contents;
    $param?: string;
    $meta?: any;
    [key: string]: any;
}

function defaults<TObject extends {}, TSource extends {}>(
    node: TObject, 
    base: TSource = {} as TSource
): NonNullable<TObject & TSource> | TObject {
    if (typeof node === 'object' && (Array.isArray(base) === Array.isArray(node))) {
        return Hoek.merge(Hoek.clone(base), Hoek.clone(node))
    }

    return node
}

function isValue<T>(node: any): node is T | undefined {
    return !node ||
        typeof node !== 'object' ||
        (!node.$filter && !node.$value)
}

function isSimple<T>(node: any): node is T | undefined {
    return !node || typeof node !== 'object'
}

function coerce<T>(value: any, type: string): T | undefined {
    let result = value
    switch (type) {
        case 'number': {
            const num = Number(value)
            result = isNaN(num) ? undefined : num
            break
        }
    }

    return result
}

// Return node or value if no filter, otherwise apply filters until node or value
function internalsFilter<Response>(node: Node, criteria: Criteria, applied?: Applied[]): Response | undefined {
    if (isValue<Response>(node)) {
        return node
    }

    if (node.$value) {
        return defaults(internalsFilter(node.$value, criteria, applied) as Response, node.$base)
    }

    // Filter

    const filter = node.$filter
    const criterion: Criterion = typeof filter === 'object' 
        ? Hoek.reach(process.env, filter.$env) 
        : Hoek.reach(criteria, filter)

    if (criterion !== undefined) {
        if (node.$range) {
            for (let i = 0; i < node.$range.length; ++i) {
                if (criterion <= node.$range[i].limit) {
                    Store._logApplied(applied, filter, node, node.$range[i])
                    return internalsFilter(node.$range[i].value, criteria, applied)
                }
            }
        }
        else if (node[criterion] !== undefined) {
            Store._logApplied(applied, filter, node, criterion)
            return defaults(internalsFilter(node[criterion], criteria, applied) as Response, node.$base)
        }

        // Falls-through for $default
    }

    if (hasOwnProperty.call(node, '$default')) {
        Store._logApplied(applied, filter, node, '$default')
        return defaults(internalsFilter(node.$default, criteria, applied) as Response, node.$base)
    }

    Store._logApplied(applied, filter, node)
    return undefined
}

function getNode<Response>(tree: Node, key: string, criteria: Criteria, applied?: Applied[]): Response | undefined {
    criteria = criteria || {}
    const path: string[] = []
    if (key !== '/') {
        const invalid = key.replace(/\/(\w+)/g, (_, $1) => {
            path.push($1)
            return ''
        })

        if (invalid) {
            return undefined
        }
    }

    let node: any = internalsFilter(tree, criteria, applied)
    for (let i = 0; i < path.length && node; ++i) {
        if (typeof node !== 'object') {
            node = undefined
            break
        }

        node = internalsFilter(node[path[i]], criteria, applied)
    }

    return node
}

// Applies criteria on an entire tree
function walk<Response>(node: Node | undefined, criteria: Criteria, applied: Applied[]): Response | undefined {
    if (isSimple<Response>(node)) {
        return node
    }

    if (hasOwnProperty.call(node, '$value')) {
        return walk(node.$value, criteria, applied)
    }

    if (hasOwnProperty.call(node, '$param')) {
        const value = Hoek.reach(criteria, node.$param)

        // Falls-through for $default
        if ((typeof value === 'undefined' || value === null) &&
            node.$default) {
            return walk(node.$default, criteria, applied)
        }

        return value
    }

    if (hasOwnProperty.call(node, '$env')) {
        const value = coerce<Response>(Hoek.reach(process.env, node.$env), node.$coerce || 'string')

        // Falls-through for $default
        if (typeof value === 'undefined' && node.$default) {
            return walk(node.$default, criteria, applied)
        }

        return value
    }

    if (Array.isArray(node)) {
        const parent = []
        for (let i = 0; i < node.length; i += 1) {
            const child = internalsFilter<Node>(node[i], criteria, applied)
            const value = walk(child, criteria, applied)
            if (value !== undefined) {
                parent.push(value)
            }
        }

        return parent as any
    }

    const parent = Object.create(null)
    const keys = Object.keys(node)

    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        if (key === '$meta') {
            continue
        }

        const child = internalsFilter<Node>(node[key], criteria, applied)
        const value = walk(child, criteria, applied)
        if (value !== undefined) {
            parent[key] = value
        }
    }

    return parent
}

export class Store {
    private _tree!: Node;

    constructor(document: unknown) {
        this.load(document || {})
    }

    load(document: unknown) {
        const err = Store.validate(document)
        Hoek.assert(!err, err)

        this._tree = Hoek.clone(document as Node)
    }

    get<Response>(key: string, criteria: Criteria, applied: Applied[]): Response | undefined {
        const node = getNode<Node>(this._tree, key, criteria, applied)
        return walk(node, criteria, applied)
    }

    meta<Response>(key: string, criteria: Criteria): Response | undefined {
        const node = getNode<Node>(this._tree, key, criteria)
        return (typeof node === 'object' ? node.$meta : undefined)
    }

    // Validate tree structure
    static validate(node: unknown): Error | null {
        const { error } = Schema.store.validate(node, { abortEarly: false })
        return error || null
    }

    static _logApplied<T>(applied: Applied[] | undefined, filter: Filter | undefined, node: Node<T>, criterion?: any): void {

        if (!applied) {
            return
        }

        const record: Applied = { filter }

        if (criterion) {
            if (typeof criterion === 'object') {
                if (criterion.id) {
                    record.valueId = criterion.id
                } else {
                    record.valueId = (typeof criterion.value === 'object' ? '[object]' : criterion.value.toString())
                }
            }
            else {
                record.valueId = criterion.toString()
            }
        }

        if (node && node.$id) {
            record.filterId = node.$id
        }

        applied.push(record)
    }
}

export default Store
