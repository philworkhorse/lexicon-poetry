const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3460;

// Pi Lexicon snapshot — updated from live Pi data
let lexiconState = {
  generation: 3003,
  words: {
    kuzinum: { meaning: 'wave', category: 'abstract', fitness: 0.750, born: 2996 },
    kam: { meaning: 'sun', category: 'natural', fitness: 0.600, born: 2999 },
    monhen: { meaning: 'mountain', category: 'natural', fitness: 0.600, born: 2989 },
    nalo: { meaning: 'river', category: 'natural', fitness: 0.550, born: 2986 },
    sarum: { meaning: 'begin', category: 'action', fitness: 0.500, born: 2993 },
    rakim: { meaning: 'seed', category: 'natural', fitness: 0.500, born: 3003 },
    mie: { meaning: 'cloud', category: 'natural', fitness: 0.500, born: 3001 },
    ara: { meaning: 'between', category: 'relation', fitness: 0.400, born: 2997 },
    ti: { meaning: 'old', category: 'quality', fitness: 0.400, born: 2981 },
    pan: { meaning: 'ocean', category: 'natural', fitness: 0.350, born: 2972 },
    e: { meaning: 'star', category: 'natural', fitness: 0.350, born: 2982 },
    ranili: { meaning: 'make', category: 'action', fitness: 0.350, born: 3000 },
    miwan: { meaning: 'high', category: 'quality', fitness: 0.300, born: 2985 },
    wiu: { meaning: 'soft', category: 'quality', fitness: 0.200, born: 2973 },
    numeto: { meaning: 'many', category: 'being', fitness: 0.200, born: 2995 },
    maza: { meaning: 'self', category: 'being', fitness: 0.100, born: 2977 },
    nununsi: { meaning: 'water', category: 'natural', fitness: 0.100, born: 2983 },
    me: { meaning: 'sky', category: 'natural', fitness: 0.100, born: 2987 },
    tuma: { meaning: 'bright', category: 'quality', fitness: 0.000, born: 2969 },
    kalawi: { meaning: 'release', category: 'action', fitness: 0.000, born: 2967 }
  },
  // Historical extinct concepts worth remembering
  extinctConcepts: [
    { word: 'zi', meaning: 'self', era: '~Gen 100', incarnation: 2 },
    { word: 'mesu', meaning: 'self', era: '~Gen 500', incarnation: 3 },
    { word: 'meshu', meaning: 'self', era: '~Gen 500-600', incarnation: 3, note: 'sound shifted from mesu' },
    { word: 'nukam', meaning: 'self', era: '~Gen 1100', incarnation: 4 },
    { word: 'tanosum', meaning: 'self', era: '~Gen 2000', incarnation: 5 },
    { word: 'kea', meaning: 'cycle', era: '~Gen 200', incarnation: 1 },
    { word: 'ka', meaning: 'emergence', era: '~Gen 300', incarnation: 1 },
    { word: 'ina', meaning: 'pattern', era: 'Gen 0-68', incarnation: 1, note: 'last Gen-0 word to die' },
    { word: 'suwen', meaning: 'deep', era: 'Gen 0-44', incarnation: 1 },
    { word: 'ki', meaning: 'cloud', era: 'Gen 0-44', incarnation: 1 },
    { word: 'pisu', meaning: 'fire', era: 'Gen 0-51', incarnation: 1 }
  ]
};

// Try to sync from Pi on startup
async function syncFromPi() {
  try {
    const res = await fetch('http://192.168.1.111:7890/api/state', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    lexiconState.generation = data.generation;
    lexiconState.words = {};
    for (const [word, info] of Object.entries(data.words)) {
      lexiconState.words[word] = {
        meaning: info.meaning,
        category: info.category,
        fitness: info.fitness,
        born: info.born
      };
    }
    console.log(`Synced from Pi: Gen ${data.generation}, ${Object.keys(data.words).length} words`);
  } catch (e) {
    console.log('Pi unreachable, using snapshot');
  }
}

// Poetry generation engine
class LexiconPoet {
  constructor(words) {
    this.words = words;
    this.entries = Object.entries(words);
  }

  pick(filter) {
    const pool = filter ? this.entries.filter(filter) : this.entries;
    if (pool.length === 0) return this.entries[Math.floor(Math.random() * this.entries.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  natural() { return this.pick(([, w]) => w.category === 'natural'); }
  quality() { return this.pick(([, w]) => w.category === 'quality'); }
  action() { return this.pick(([, w]) => w.category === 'action'); }
  abstract() { return this.pick(([, w]) => ['abstract', 'being', 'relation'].includes(w.category)); }
  any() { return this.pick(); }

  // Haiku-like: 3 lines, 3-5 words each, following patterns
  haiku() {
    const patterns = [
      // nature-quality / action-abstract / nature
      () => {
        const [w1, i1] = this.natural();
        const [w2, i2] = this.quality();
        const [w3, i3] = this.action();
        const [w4, i4] = this.abstract();
        const [w5, i5] = this.natural();
        return {
          lines: [
            [{ word: w1, meaning: i1.meaning }, { word: w2, meaning: i2.meaning }],
            [{ word: w3, meaning: i3.meaning }, { word: w4, meaning: i4.meaning }, { word: w5, meaning: i5.meaning }],
            [{ word: w1, meaning: i1.meaning }]
          ]
        };
      },
      // abstract-natural / natural-quality / action
      () => {
        const [w1, i1] = this.abstract();
        const [w2, i2] = this.natural();
        const [w3, i3] = this.natural();
        const [w4, i4] = this.quality();
        const [w5, i5] = this.action();
        return {
          lines: [
            [{ word: w1, meaning: i1.meaning }, { word: w2, meaning: i2.meaning }],
            [{ word: w3, meaning: i3.meaning }, { word: w4, meaning: i4.meaning }],
            [{ word: w5, meaning: i5.meaning }]
          ]
        };
      },
      // self-aware: uses maza if alive
      () => {
        const hasSelf = this.entries.find(([w]) => this.words[w].meaning === 'self');
        const self = hasSelf || this.any();
        const [w1, i1] = this.natural();
        const [w2, i2] = this.quality();
        const [w3, i3] = this.action();
        const [w4, i4] = this.natural();
        return {
          lines: [
            [{ word: self[0], meaning: self[1].meaning }, { word: w2, meaning: i2.meaning }],
            [{ word: w1, meaning: i1.meaning }, { word: w3, meaning: i3.meaning }, { word: w4, meaning: i4.meaning }],
            [{ word: self[0], meaning: self[1].meaning }]
          ]
        };
      },
      // between-pattern: relation words frame natural
      () => {
        const [w1, i1] = this.natural();
        const [w2, i2] = this.natural();
        const rel = this.entries.find(([w]) => this.words[w].category === 'relation') || this.any();
        const [w4, i4] = this.quality();
        const [w5, i5] = this.action();
        return {
          lines: [
            [{ word: w1, meaning: i1.meaning }, { word: rel[0], meaning: rel[1].meaning }, { word: w2, meaning: i2.meaning }],
            [{ word: w4, meaning: i4.meaning }],
            [{ word: w5, meaning: i5.meaning }, { word: w1, meaning: i1.meaning }]
          ]
        };
      },
      // meditation: repetition with variation
      () => {
        const [w1, i1] = this.natural();
        const [w2, i2] = this.quality();
        const [w3, i3] = this.natural();
        return {
          lines: [
            [{ word: w1, meaning: i1.meaning }, { word: w1, meaning: i1.meaning }],
            [{ word: w2, meaning: i2.meaning }, { word: w3, meaning: i3.meaning }],
            [{ word: w1, meaning: i1.meaning }]
          ]
        };
      },
      // long form: more complex sentence-like
      () => {
        const [w1, i1] = this.action();
        const [w2, i2] = this.natural();
        const [w3, i3] = this.quality();
        const [w4, i4] = this.abstract();
        const [w5, i5] = this.natural();
        const [w6, i6] = this.action();
        return {
          lines: [
            [{ word: w1, meaning: i1.meaning }, { word: w2, meaning: i2.meaning }, { word: w3, meaning: i3.meaning }],
            [{ word: w4, meaning: i4.meaning }, { word: w5, meaning: i5.meaning }],
            [{ word: w6, meaning: i6.meaning }, { word: w2, meaning: i2.meaning }]
          ]
        };
      }
    ];

    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    return pattern();
  }

  // Tanka-like: 5 lines
  tanka() {
    const [w1, i1] = this.natural();
    const [w2, i2] = this.quality();
    const [w3, i3] = this.action();
    const [w4, i4] = this.abstract();
    const [w5, i5] = this.natural();
    const [w6, i6] = this.natural();
    const [w7, i7] = this.quality();
    return {
      lines: [
        [{ word: w1, meaning: i1.meaning }, { word: w2, meaning: i2.meaning }],
        [{ word: w3, meaning: i3.meaning }, { word: w4, meaning: i4.meaning }],
        [{ word: w5, meaning: i5.meaning }],
        [{ word: w6, meaning: i6.meaning }, { word: w3, meaning: i3.meaning }, { word: w1, meaning: i1.meaning }],
        [{ word: w7, meaning: i7.meaning }]
      ]
    };
  }

  // Renga-like: collaborative chain, each stanza responds to previous
  renga(count = 4) {
    const stanzas = [];
    let lastWord = null;
    for (let i = 0; i < count; i++) {
      const stanza = this.haiku();
      if (lastWord && Math.random() > 0.3) {
        // Echo a word from previous stanza
        stanza.lines[0].unshift(lastWord);
      }
      const allWords = stanza.lines.flat();
      lastWord = allWords[allWords.length - 1];
      stanzas.push(stanza);
    }
    return stanzas;
  }

  // Generate multiple poems as a collection
  collection(count = 6) {
    const poems = [];
    for (let i = 0; i < count; i++) {
      if (i % 3 === 0 && i < count - 1) {
        poems.push({ type: 'tanka', ...this.tanka() });
      } else {
        poems.push({ type: 'haiku', ...this.haiku() });
      }
    }
    return poems;
  }
}

// API
app.get('/api/poem', (req, res) => {
  const poet = new LexiconPoet(lexiconState.words);
  const poem = poet.haiku();
  res.json({ generation: lexiconState.generation, poem });
});

app.get('/api/collection', (req, res) => {
  const count = parseInt(req.query.count) || 6;
  const poet = new LexiconPoet(lexiconState.words);
  const poems = poet.collection(count);
  res.json({ generation: lexiconState.generation, wordCount: Object.keys(lexiconState.words).length, poems });
});

app.get('/api/renga', (req, res) => {
  const count = parseInt(req.query.count) || 4;
  const poet = new LexiconPoet(lexiconState.words);
  const stanzas = poet.renga(count);
  res.json({ generation: lexiconState.generation, stanzas });
});

app.get('/api/words', (req, res) => {
  res.json({ generation: lexiconState.generation, words: lexiconState.words, extinct: lexiconState.extinctConcepts });
});

// Serve static HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

syncFromPi().then(() => {
  app.listen(PORT, () => console.log(`Lexicon Poetry on :${PORT}`));
});
