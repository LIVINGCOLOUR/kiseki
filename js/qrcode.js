/*
 * qrcode.js - 軌跡のQR発行に使う、外部CDNに依存しないローカル実装。
 * Public API: window.QRCodeLite.generate(text) / toCanvas(canvas, text, opts)
 */
(function (global) {
  "use strict";

  // 誤り訂正レベルM, バージョン1〜9の [ECコード語/ブロック, 群1ブロック数, 群1データ語, 群2ブロック数, 群2データ語]
  var EC_M = {
    1: [10, 1, 16, 0, 0],
    2: [16, 1, 28, 0, 0],
    3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0],
    8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37],
  };

  // 各バージョンの位置合わせパターン中心座標。
  var ALIGN = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
  };

  // GF(256) 指数・対数テーブル（原始多項式 0x11D）。
  var EXP = new Array(512);
  var LOG = new Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i += 1) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j += 1) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // ECコード語数 n の生成多項式を返す。
  function rsGenerator(n) {
    var poly = [1];
    for (var i = 0; i < n; i += 1) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j += 1) {
        next[j] ^= gfMul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  // データ語列に対するRS誤り訂正コード語を返す。
  function rsEncode(data, ecCount) {
    var gen = rsGenerator(ecCount).reverse(); // 最高次が先頭、gen[0]=1 に揃える
    var res = new Array(ecCount).fill(0);
    for (var i = 0; i < data.length; i += 1) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      // 先頭係数(gen[0]=1)はfactor算出に使用済みのため gen[1..ecCount] を使う。
      for (var j = 0; j < ecCount; j += 1) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return res;
  }

  function chooseVersion(byteLength) {
    for (var v = 1; v <= 9; v += 1) {
      var ec = EC_M[v];
      var totalData = ec[1] * ec[2] + ec[3] * ec[4];
      var capacityBits = totalData * 8;
      var neededBits = 4 + 8 + byteLength * 8; // モード(4) + 文字数(8, v1-9) + データ
      if (neededBits <= capacityBits) return v;
    }
    throw new Error("データが長すぎてQRに収まりません。");
  }

  function textToBytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i += 1) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
        var c2 = text.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i += 1;
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return out;
  }

  // バイト列をビット列（0/1配列）に展開して終端・パディングまで行う。
  function buildBitStream(bytes, version) {
    var ec = EC_M[version];
    var totalData = ec[1] * ec[2] + ec[3] * ec[4];
    var bits = [];
    function push(value, len) {
      for (var i = len - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    }
    push(0b0100, 4); // バイトモード
    push(bytes.length, 8); // 文字数指示子（v1-9）
    for (var i = 0; i < bytes.length; i += 1) push(bytes[i], 8);

    var capacityBits = totalData * 8;
    // 終端子（最大4ビット）
    var terminator = Math.min(4, capacityBits - bits.length);
    for (var t = 0; t < terminator; t += 1) bits.push(0);
    // バイト境界までゼロ埋め
    while (bits.length % 8 !== 0) bits.push(0);
    // 埋め草コード語 0xEC, 0x11 を交互に
    var pad = [0xec, 0x11];
    var pi = 0;
    while (bits.length < capacityBits) {
      push(pad[pi % 2], 8);
      pi += 1;
    }
    // ビット→データ語
    var codewords = [];
    for (var b = 0; b < bits.length; b += 8) {
      var val = 0;
      for (var k = 0; k < 8; k += 1) val = (val << 1) | bits[b + k];
      codewords.push(val);
    }
    return codewords;
  }

  // データ語をブロック分割しEC付与、インターリーブして最終コード語列を返す。
  function interleave(dataCodewords, version) {
    var ec = EC_M[version];
    var ecPerBlock = ec[0];
    var blocks = [];
    var idx = 0;
    var groups = [[ec[1], ec[2]], [ec[3], ec[4]]];
    for (var g = 0; g < groups.length; g += 1) {
      for (var bcount = 0; bcount < groups[g][0]; bcount += 1) {
        var data = dataCodewords.slice(idx, idx + groups[g][1]);
        idx += groups[g][1];
        blocks.push({ data: data, ec: rsEncode(data, ecPerBlock) });
      }
    }
    var result = [];
    var maxData = Math.max.apply(null, blocks.map(function (b) { return b.data.length; }));
    for (var c = 0; c < maxData; c += 1) {
      for (var bi = 0; bi < blocks.length; bi += 1) {
        if (c < blocks[bi].data.length) result.push(blocks[bi].data[c]);
      }
    }
    for (var e = 0; e < ecPerBlock; e += 1) {
      for (var bj = 0; bj < blocks.length; bj += 1) {
        result.push(blocks[bj].ec[e]);
      }
    }
    return result;
  }

  function createMatrix(version) {
    var size = version * 4 + 17;
    var modules = [];
    var reserved = [];
    for (var r = 0; r < size; r += 1) {
      modules.push(new Array(size).fill(null));
      reserved.push(new Array(size).fill(false));
    }
    return { size: size, modules: modules, reserved: reserved, version: version };
  }

  function setFunction(m, r, c, val) {
    m.modules[r][c] = val ? 1 : 0;
    m.reserved[r][c] = true;
  }

  function placeFinder(m, row, col) {
    for (var r = -1; r <= 7; r += 1) {
      for (var c = -1; c <= 7; c += 1) {
        var rr = row + r;
        var cc = col + c;
        if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
        var isBorder = r >= 0 && r <= 6 && (c === 0 || c === 6);
        var isBorder2 = c >= 0 && c <= 6 && (r === 0 || r === 6);
        var isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFunction(m, rr, cc, isBorder || isBorder2 || isCenter);
      }
    }
  }

  function placeAlignment(m) {
    var centers = ALIGN[m.version];
    for (var i = 0; i < centers.length; i += 1) {
      for (var j = 0; j < centers.length; j += 1) {
        var row = centers[i];
        var col = centers[j];
        if (m.reserved[row][col]) continue; // ファインダと重なる位置は除外
        for (var r = -2; r <= 2; r += 1) {
          for (var c = -2; c <= 2; c += 1) {
            var dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setFunction(m, row + r, col + c, dark);
          }
        }
      }
    }
  }

  function placeTimingAndStatics(m) {
    for (var i = 8; i < m.size - 8; i += 1) {
      var dark = i % 2 === 0;
      if (!m.reserved[6][i]) setFunction(m, 6, i, dark);
      if (!m.reserved[i][6]) setFunction(m, i, 6, dark);
    }
    // ダークモジュール
    setFunction(m, 4 * m.version + 9, 8, true);
  }

  function reserveFormatAreas(m) {
    var size = m.size;
    for (var i = 0; i < 9; i += 1) {
      if (!m.reserved[8][i]) { m.reserved[8][i] = true; m.modules[8][i] = 0; }
      if (!m.reserved[i][8]) { m.reserved[i][8] = true; m.modules[i][8] = 0; }
    }
    for (var j = 0; j < 8; j += 1) {
      m.reserved[8][size - 1 - j] = true; m.modules[8][size - 1 - j] = 0;
      m.reserved[size - 1 - j][8] = true; m.modules[size - 1 - j][8] = 0;
    }
  }

  function reserveVersionAreas(m) {
    if (m.version < 7) return;
    var size = m.size;
    for (var i = 0; i < 6; i += 1) {
      for (var j = 0; j < 3; j += 1) {
        m.reserved[i][size - 11 + j] = true; m.modules[i][size - 11 + j] = 0;
        m.reserved[size - 11 + j][i] = true; m.modules[size - 11 + j][i] = 0;
      }
    }
  }

  function placeData(m, codewords) {
    var bits = [];
    for (var i = 0; i < codewords.length; i += 1) {
      for (var b = 7; b >= 0; b -= 1) bits.push((codewords[i] >> b) & 1);
    }
    var size = m.size;
    var bitIndex = 0;
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1; // タイミング列はスキップ
      for (var n = 0; n < size; n += 1) {
        var row = upward ? size - 1 - n : n;
        for (var k = 0; k < 2; k += 1) {
          var c = col - k;
          if (m.reserved[row][c]) continue;
          var bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          m.modules[row][c] = bit;
          bitIndex += 1;
        }
      }
      upward = !upward;
    }
  }

  function maskCondition(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function applyMask(m, mask) {
    var out = createMatrix(m.version);
    for (var r = 0; r < m.size; r += 1) {
      for (var c = 0; c < m.size; c += 1) {
        out.modules[r][c] = m.modules[r][c];
        out.reserved[r][c] = m.reserved[r][c];
        if (!m.reserved[r][c] && maskCondition(mask, r, c)) {
          out.modules[r][c] ^= 1;
        }
      }
    }
    return out;
  }

  function bchFormat(data) {
    var g = 0x537;
    var value = data << 10;
    for (var i = 14; i >= 10; i -= 1) {
      if ((value >> i) & 1) value ^= g << (i - 10);
    }
    return ((data << 10) | (value & 0x3ff)) ^ 0x5412;
  }

  function bchVersion(version) {
    var g = 0x1f25;
    var value = version << 12;
    for (var i = 17; i >= 12; i -= 1) {
      if ((value >> i) & 1) value ^= g << (i - 12);
    }
    return (version << 12) | (value & 0xfff);
  }

  function placeFormatInfo(m, mask) {
    var ecBits = 0b00; // レベルM
    var format = bchFormat((ecBits << 3) | mask); // 15ビット、bit0がLSB
    var size = m.size;
    var getBit = function (i) { return (format >> i) & 1; };
    // 1つ目（左上）: bit0-5は列8の上、bit6-8は角、bit9-14は行8の左。
    for (var i = 0; i <= 5; i += 1) m.modules[i][8] = getBit(i);
    m.modules[7][8] = getBit(6);
    m.modules[8][8] = getBit(7);
    m.modules[8][7] = getBit(8);
    for (var j = 9; j < 15; j += 1) m.modules[8][14 - j] = getBit(j);
    // 2つ目: bit0-7は行8の右、bit8-14は列8の下。
    for (var k = 0; k < 8; k += 1) m.modules[8][size - 1 - k] = getBit(k);
    for (var l = 8; l < 15; l += 1) m.modules[size - 15 + l][8] = getBit(l);
    m.modules[size - 8][8] = 1; // 常に暗モジュール
  }

  function placeVersionInfo(m) {
    if (m.version < 7) return;
    var bits = bchVersion(m.version);
    var size = m.size;
    for (var i = 0; i < 18; i += 1) {
      var bit = (bits >> i) & 1;
      var row = Math.floor(i / 3);
      var col = i % 3;
      m.modules[row][size - 11 + col] = bit;
      m.modules[size - 11 + col][row] = bit;
    }
  }

  function penalty(m) {
    var size = m.size;
    var score = 0;
    var mod = m.modules;
    // 規則1: 同色連続
    for (var r = 0; r < size; r += 1) {
      var runC = 1, runR = 1;
      for (var c = 1; c < size; c += 1) {
        if (mod[r][c] === mod[r][c - 1]) { runC += 1; } else { if (runC >= 5) score += runC - 2; runC = 1; }
        if (mod[c][r] === mod[c - 1][r]) { runR += 1; } else { if (runR >= 5) score += runR - 2; runR = 1; }
      }
      if (runC >= 5) score += runC - 2;
      if (runR >= 5) score += runR - 2;
    }
    // 規則2: 2x2 同色ブロック
    for (var r2 = 0; r2 < size - 1; r2 += 1) {
      for (var c2 = 0; c2 < size - 1; c2 += 1) {
        var v = mod[r2][c2];
        if (v === mod[r2][c2 + 1] && v === mod[r2 + 1][c2] && v === mod[r2 + 1][c2 + 1]) score += 3;
      }
    }
    // 規則3: 1011101 パターン
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function matches(line, start, pat) {
      for (var k = 0; k < pat.length; k += 1) if (line[start + k] !== pat[k]) return false;
      return true;
    }
    for (var r3 = 0; r3 < size; r3 += 1) {
      for (var c3 = 0; c3 <= size - 11; c3 += 1) {
        var rowLine = mod[r3];
        if (matches(rowLine, c3, pat1) || matches(rowLine, c3, pat2)) score += 40;
        var colLine = [];
        for (var t = 0; t < 11; t += 1) colLine.push(mod[c3 + t][r3]);
        if (matches(colLine, 0, pat1) || matches(colLine, 0, pat2)) score += 40;
      }
    }
    // 規則4: 暗モジュール比率
    var dark = 0;
    for (var r4 = 0; r4 < size; r4 += 1) for (var c4 = 0; c4 < size; c4 += 1) if (mod[r4][c4]) dark += 1;
    var percent = (dark * 100) / (size * size);
    var prev = Math.floor(percent / 5) * 5;
    score += Math.min(Math.abs(prev - 50), Math.abs(prev + 5 - 50)) / 5 * 10;
    return score;
  }

  function generate(text, options) {
    options = options || {};
    var bytes = textToBytes(String(text));
    var version = options.version || chooseVersion(bytes.length);
    var dataCodewords = buildBitStream(bytes, version);
    var finalCodewords = interleave(dataCodewords, version);

    var base = createMatrix(version);
    placeFinder(base, 0, 0);
    placeFinder(base, 0, base.size - 7);
    placeFinder(base, base.size - 7, 0);
    placeAlignment(base);
    placeTimingAndStatics(base);
    reserveFormatAreas(base);
    reserveVersionAreas(base);
    placeData(base, finalCodewords);

    var best = null;
    var bestMask = 0;
    var bestScore = Infinity;
    var forced = typeof options.mask === "number" ? options.mask : null;
    for (var mask = 0; mask < 8; mask += 1) {
      if (forced !== null && mask !== forced) continue;
      var candidate = applyMask(base, mask);
      placeFormatInfo(candidate, mask);
      placeVersionInfo(candidate);
      var score = penalty(candidate);
      if (score < bestScore) { bestScore = score; best = candidate; bestMask = mask; }
    }
    return { size: best.size, modules: best.modules, version: version, mask: bestMask };
  }

  function toCanvas(canvas, text, options) {
    options = options || {};
    var scale = options.scale || 8;
    var margin = options.margin == null ? 4 : options.margin;
    var qr = generate(text, options);
    var dim = (qr.size + margin * 2) * scale;
    canvas.width = dim;
    canvas.height = dim;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = options.background || "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = options.color || "#1b1810";
    for (var r = 0; r < qr.size; r += 1) {
      for (var c = 0; c < qr.size; c += 1) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
        }
      }
    }
    return qr;
  }

  var api = { generate: generate, toCanvas: toCanvas };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QRCodeLite = api;
})(typeof window !== "undefined" ? window : this);
