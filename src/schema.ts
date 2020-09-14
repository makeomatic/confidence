'use strict'

// Load modules

import Joi = require('@hapi/joi');

// Declare internals
type Internals = {
    Joi: Joi.Root;
    alternatives: Joi.AlternativesSchema;
    store: Joi.ObjectSchema;
}

export type Range = {
    limit: number;
    value: any;
    id?: string;
}

const internals: Internals = Object.create(null)
const { hasOwnProperty } = Object.prototype

internals.Joi = Joi.extend({
    type: 'object',
    base: Joi.object(),
    messages: {
        'object.withPattern': 'fails to match the {{#name}} pattern',
        'object.notInstanceOf': 'cannot be an instance of {{#name}}'
    },
    rules: {
        withPattern: {
            multi: true,
            args: [{
                name: 'key',
                assert: Joi.string().required()
            }, {
                name: 'pattern',
                assert: Joi.object().instance(RegExp).required()
            }, {
                name: 'options',
                assert: Joi.object({
                    name: Joi.string().required(),
                    inverse: Joi.boolean()
                }).required()
            }],
            method(key, pattern, options) {

                return this.$_addRule({ name: 'withPattern', args: { key, pattern, options } })
            },
            validate(value, helpers, args) {

                const { pattern } = args

                if (hasOwnProperty.call(value, args.key)) {
                    let found = false
                    for (const key in value) {
                        if (pattern.test(key)) {
                            found = true
                            break
                        }
                    }

                    const inverse = hasOwnProperty.call(args.options, 'inverse')
                        ? args.options.inverse
                        : false

                    if (found !== inverse) {
                        return helpers.error('object.withPattern', { name: args.options.name })
                    }
                }

                return value
            }
        },
        notInstanceOf: {
            args: [{
                name: 'fn',
                assert: Joi.function().required()
            }],
            multi: true,
            method(fn) {

                return this.$_addRule({ name: 'notInstanceOf', args: { fn } })
            },
            validate(value, helpers, args) {

                if (value instanceof args.fn) {
                    return helpers.error('object.notInstanceOf', { name: args.fn.name })
                }

                return value
            }
        }
    }
}, {
    type: 'array',
    base: Joi.array(),
    messages: {
        'array.sorted': 'entries are not sorted by {{name}}'
    },
    rules: {
        sorted: {
            args: [{
                name: 'fn',
                assert: Joi.function().arity(2).required()
            }, {
                name: 'name',
                assert: Joi.string().required()
            }],
            method(fn, name) {

                return this.$_addRule({ name: 'sorted', args: { fn, name } })
            },
            validate(value, helpers, args) {

                let sorted = true
                for (let i = 0; i < value.length - 1; ++i) {
                    sorted = args.fn.call(null, value[i], value[i + 1])
                    if (!sorted) {
                        return helpers.error('array.sorted', { name: args.name })
                    }
                }

                return value
            }
        }
    }
})

internals.alternatives = internals.Joi.alternatives([
    internals.Joi.link('#confidence-store'),
    internals.Joi.string().allow(''),
    internals.Joi.number(),
    internals.Joi.boolean(),
    internals.Joi.array(),
    internals.Joi.function()
])
    .id('confidence-alternatives')

export const store = internals.store = internals.Joi.object({
    $param: internals.Joi.string().regex(/^\w+(?:\.\w+)*$/, { name: 'Alphanumeric Characters and "_"' }),
    $value: internals.alternatives,
    $env: internals.Joi.string().regex(/^\w+$/, { name: 'Alphanumeric Characters and "_"' }),
    $coerce: internals.Joi.string().valid('number'),
    $filter: internals.Joi.alternatives([
        internals.Joi.string().regex(/^\w+(?:\.\w+)*$/, { name: 'Alphanumeric Characters and "_"' }),
        internals.Joi.object().keys({
            $env: internals.Joi.string().regex(/^\w+$/, { name: 'Alphanumeric Characters and "_"' }).required()
        })
    ]),
    $base: internals.alternatives,
    $default: internals.alternatives,
    $id: internals.Joi.string(),
    $range: internals.Joi.array().items(
        internals.Joi.object({
            limit: internals.Joi.number().required(),
            value: internals.Joi.link('#confidence-alternatives').required(),
            id: internals.Joi.string().optional()
        })
    ).sorted((a: Range, b: Range) => a.limit < b.limit, '"entry.limit" in Ascending order' ).min(1),
    $meta: internals.Joi.alternatives([Joi.object(), Joi.string()])
})
    .pattern(/^[^$].*$/, internals.alternatives)
    .notInstanceOf(Error)
    .notInstanceOf(RegExp)
    .notInstanceOf(Date)
    .without('$value', ['$filter', '$range', '$base', '$default', '$id', '$param', '$env'])
    .without('$param', ['$filter', '$range', '$base', '$id', '$value', '$env'])
    .without('$env', ['$filter', '$range', '$base', '$id', '$value', '$param'])
    .withPattern('$value', /^([^$].*)$/, { name: '$value directive can only be used with $meta or $default or nothing' })
    .withPattern('$param', /^([^$].*)$/, { name: '$param directive can only be used with $meta or $default or nothing' })
    .withPattern('$env', /^([^$].*)$/, { name: '$env directive can only be used with $meta or $default or nothing' })
    .withPattern('$default', /^((\$param)|(\$filter)|(\$env))$/, { inverse: true, name: '$default direct requires $filter or $param or $env' })
    .with('$range', '$filter')
    .with('$base', '$filter')
    .with('$coerce', '$env')
    .withPattern('$filter', /^((\$range)|([^$].*))$/, { inverse: true, name: '$filter with a valid value OR $range' })
    .withPattern('$range', /^([^$].*)$/, { name: '$range with non-ranged values' })
    .allow(null)
    .id('confidence-store')

declare module '@hapi/joi' {
    interface ObjectSchema<TSchema = any> {
        // eslint-disable-next-line @typescript-eslint/ban-types
        notInstanceOf(constructor: Function, name?: string): this;
        withPattern(key: string, pattern: RegExp, options: { name?: string; inverse?: boolean }): this;
    }

    interface ArraySchema {
        sorted(a: unknown, b: unknown): this;
    }
}