"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Crypto = require("crypto");
// Portions based on node-uuid - https://github.com/broofa/node-uuid - Copyright (c) 2010-2012 Robert Kieffer - MIT License
const byteToHex = [];
const buildCache = function () {
    for (let i = 0; i < 256; ++i) {
        const hex = (i < 16 ? '0' : '') + i.toString(16);
        byteToHex[i] = hex;
    }
};
buildCache();
function generate() {
    let rand = Crypto.randomBytes(10);
    rand[6] = (rand[6] & 0x0f) | 0x40; // Per RFC 4122 (4.4) - set bits for version and `clock_seq_hi_and_reserved`
    rand[8] = (rand[8] & 0x3f) | 0x80;
    const b = byteToHex;
    let id = b[rand[0]] + b[rand[1]] + b[rand[2]] + b[rand[3]] + '-' +
        b[rand[4]] + b[rand[5]] + '-' +
        b[rand[6]] + b[rand[7]] + '-' +
        b[rand[8]] + b[rand[9]] + '-';
    const distributedRandom3B = function () {
        let bytes = '';
        while (!bytes) { // This can theoretically loop forever if the machine random device generates garbage
            rand = Crypto.randomBytes(3);
            const value = (rand[0] << 16) | (rand[1] << 8) | rand[2];
            if (value >= 10000000) {
                continue;
            }
            bytes = byteToHex[rand[0]] + byteToHex[rand[1]] + byteToHex[rand[2]];
        }
        return bytes;
    };
    id += distributedRandom3B();
    id += distributedRandom3B();
    return id;
}
exports.generate = generate;
function criteria(id) {
    if (!id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
        return null;
    }
    const parse = function (from, to) {
        const hex = id.slice(from, to);
        const value = parseInt(hex, 16);
        if (value >= 10000000) {
            return null;
        }
        const set = value.toString().split('');
        const output = new Array(set.length);
        for (let i = 0; i < set.length; ++i) {
            output[i] = parseInt(set[i], 10);
        }
        for (let i = 0; i < 7 - set.length; ++i) {
            output.unshift(0);
        }
        return output;
    };
    const set1 = parse(24, 30);
    const set2 = parse(30);
    if (set1 === null ||
        set2 === null) {
        return null;
    }
    const criteria = {
        $id: id,
        random: {
            a: (set1[0] * 10) + set1[1] + 1,
            b: (set1[1] * 10) + set1[2] + 1,
            c: (set1[2] * 10) + set1[3] + 1,
            d: (set1[3] * 10) + set1[4] + 1,
            e: (set1[4] * 10) + set1[5] + 1,
            f: (set1[5] * 10) + set1[6] + 1,
            g: (set1[6] * 10) + set2[0] + 1,
            h: (set2[0] * 10) + set2[1] + 1,
            i: (set2[1] * 10) + set2[2] + 1,
            j: (set2[2] * 10) + set2[3] + 1,
            k: (set2[3] * 10) + set2[4] + 1,
            l: (set2[4] * 10) + set2[5] + 1,
            m: (set2[5] * 10) + set2[6] + 1,
            n: (set2[6] * 10) + set1[0] + 1
        }
    };
    return criteria;
}
exports.criteria = criteria;
//# sourceMappingURL=id.js.map