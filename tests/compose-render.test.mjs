import {PART_KINDS} from '../engine/src/style-kit/system/types.ts';
import {composeSceneSchema} from '../engine/src/creative-kit/compose/schema.ts';
// tests/compose-render.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRenderer} from '../scripts/lib/ssr-frames.mjs';
import {bundleEngine, setSsrFrame} from './helpers/engine-bundle.mjs';
import {partSpan, resolveComposeAt, validateComposeTiming, composeHoldFrames} from '../engine/src/creative-kit/compose/timing.ts';

// Only explicitly approved idle elements are exempt from the motion lock.
const normalizeIdle = html => html.replace(/<[a-z][^>]*\bdata-idle="[^"]*"[^>]*>/gi, tag => tag.replace(/\sstyle="[^"]*"/g, ''));
const assertFrozen = (first, later, message) => assert.ok(normalizeIdle(first) === normalizeIdle(later), message);

const renderer = await createFrameRenderer();
const words = [{sourceIndex: 3, fromFrame: 20, toFrame: 30, text: 'أربعين', segmentIndex: 0, startMs: 0, endMs: 0, confidence: 1}];
const scene = (layout, data) => ({id: 'demo', family: 'compose', layout, motion: 'land', fromFrame: 0, durationInFrames: 150, data});
const pages = {
  number: {arrangement: 'hero', parts: [{id: 'k', kind: 'kicker', at: {frame: 0}, text: 'بالأرقام'}, {id: 'n', kind: 'number', at: {word: 3}, value: 40000, label: 'في ٣ شهور', emphasis: true}]},
  quote: {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'رأي الضيف'}, {id: 'q', kind: 'quote', at: {frame: 12}, text: 'الفكرة الواضحة تكسب', speaker: 'ضيف الحلقة'}]},
  list: {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'ثلاث خطوات'}, {id: 'l', kind: 'list', at: {frame: 10}, items: [{text: 'اكتب', mark: 'check'}, {text: 'صوّر', mark: 'check'}, {text: 'انشر', mark: 'none'}]}]},
  columns: {arrangement: 'two-column', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'قبل وبعد'}, {id: 'a', kind: 'card', at: {frame: 10}, title: 'قبل', body: 'وقت أطول'}, {id: 'b', kind: 'card', at: {frame: 20}, title: 'بعد', body: 'وقت أقل'}]},
};

for (const [name, data] of Object.entries(pages)) for (const layout of ['takeover', 'split']) for (const frame of [0, 40, 149]) {
  test(`compose ${name} ${layout} @${frame} renders as a magazine page`, () => {
    const html = renderer.renderScene({scene: scene(layout, data), style: 'magazine-interview', frame, words});
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /data-style-system="magazine-interview"/);
    assert.match(html, /#081321|#F5F0E4/i); // navy or cream page ground
  });
}

test('an English page aligns left', () => {
  const html = renderer.renderScene({scene: scene('takeover', {arrangement: 'stack', parts: [{id: 'h', kind: 'headline', at: {frame: 0}, text: 'Three steps'}]}), style: 'magazine-interview', frame: 60});
  assert.match(html, /text-align:left/);
});

// Frozen data copied from the approved Task 6 samples; tests do not depend on the ignored pilot folder.
const pilotPages = {
  "number": {
    "words": [
      {
        "sourceIndex": 3,
        "fromFrame": 14,
        "toFrame": 26
      }
    ],
    "data": {
      "section": "الأرقام",
      "arrangement": "hero",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "بالأرقام"
        },
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 4
          },
          "text": "النتيجة بعد شهر واحد"
        },
        {
          "id": "n",
          "kind": "number",
          "at": {
            "word": 3
          },
          "value": 40000,
          "suffix": "+",
          "label": "مشاهدة في أول أسبوع",
          "emphasis": true
        },
        {
          "id": "l",
          "kind": "line",
          "at": {
            "frame": 60
          },
          "text": "رقم توضيحي للمعاينة"
        }
      ]
    }
  },
  "quote": {
    "data": {
      "section": "من الحلقة",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "رأي الضيف"
        },
        {
          "id": "q",
          "kind": "quote",
          "at": {
            "frame": 8
          },
          "text": "الفكرة الواضحة بتختصر نص الشرح، والباقي مجرد تفاصيل",
          "speaker": "اسم الضيف",
          "role": "ضيف الحلقة"
        },
        {
          "id": "r",
          "kind": "rule",
          "at": {
            "frame": 50
          }
        }
      ]
    }
  },
  "list": {
    "data": {
      "section": "قبل النشر",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "قبل ما تنشر، راجع التلات حاجات دول"
        },
        {
          "id": "l",
          "kind": "list",
          "at": {
            "frame": 16
          },
          "staggerFrames": 14,
          "items": [
            {
              "text": "جملة أولى بتشد",
              "detail": "في أول تلات ثواني",
              "mark": "check"
            },
            {
              "text": "صوت واضح",
              "detail": "من غير صدى ولا دوشة",
              "mark": "check"
            },
            {
              "text": "نهاية بتقفل الفكرة",
              "detail": "مش بتقطع فجأة",
              "mark": "cross"
            }
          ]
        }
      ]
    }
  },
  "compare": {
    "data": {
      "section": "قبل وبعد",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "قبل وبعد"
        },
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 4
          },
          "text": "نفس الشاشة بعد الترتيب"
        },
        {
          "id": "m",
          "kind": "media",
          "at": {
            "frame": 16
          },
          "source": {
            "kind": "compare",
            "revealFrames": 50,
            "before": {
              "src": "projects/pilot/before.png",
              "width": 960,
              "height": 540,
              "label": "قبل"
            },
            "after": {
              "src": "projects/pilot/after.png",
              "width": 960,
              "height": 540,
              "label": "بعد"
            }
          },
          "caption": "صور توضيحية للمعاينة"
        }
      ]
    }
  },
  "chart": {
    "data": {
      "section": "المقارنة",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "الوقت اللي بياخده كل نوع"
        },
        {
          "id": "b",
          "kind": "bars",
          "at": {
            "frame": 14
          },
          "unit": "بالدقايق، أرقام توضيحية",
          "items": [
            {
              "label": "فيديو قصير",
              "value": 12
            },
            {
              "label": "بودكاست",
              "value": 45,
              "offsetFrames": 10
            },
            {
              "label": "بث مباشر",
              "value": 90,
              "offsetFrames": 20
            }
          ]
        }
      ]
    }
  },
  "chat": {
    "data": {
      "section": "الرسايل",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "سؤال وصلني"
        },
        {
          "id": "c",
          "kind": "chat",
          "at": {
            "frame": 8
          },
          "messages": [
            {
              "from": "them",
              "text": "أبدأ منين لو معنديش أي خبرة؟",
              "offsetFrames": 0
            },
            {
              "from": "me",
              "text": "ابدأ بفكرة واحدة بس",
              "offsetFrames": 26
            },
            {
              "from": "them",
              "text": "يعني فيديو واحد كل يوم يكفي؟",
              "offsetFrames": 52
            }
          ]
        }
      ]
    }
  },
  "screen": {
    "data": {
      "section": "على الموقع",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "خطوة الدفع"
        },
        {
          "id": "s",
          "kind": "screen",
          "at": {
            "frame": 8
          },
          "page": "web",
          "title": "سلة المشتريات",
          "url": "sample.shop/cart",
          "focus": 3,
          "blocks": [
            {
              "kind": "heading",
              "text": "إتمام الطلب"
            },
            {
              "kind": "row",
              "text": "المنتج",
              "value": 450
            },
            {
              "kind": "row",
              "text": "الشحن",
              "value": 35
            },
            {
              "kind": "button",
              "text": "ادفع الآن"
            }
          ]
        }
      ]
    }
  },
  "timeline": {
    "data": {
      "section": "الطريقة",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "أربع خطوات لأول فيديو"
        },
        {
          "id": "s",
          "kind": "steps",
          "at": {
            "frame": 14
          },
          "items": [
            {
              "title": "اختار الفكرة",
              "detail": "جملة واحدة تلخصها",
              "offsetFrames": 0
            },
            {
              "title": "اكتب البداية",
              "detail": "أول تلات ثواني",
              "offsetFrames": 16
            },
            {
              "title": "صوّر مرة واحدة",
              "detail": "من غير ما توقف",
              "offsetFrames": 32
            },
            {
              "title": "راجع وانشر",
              "detail": "شوفه بعين المتابع",
              "offsetFrames": 48
            }
          ]
        }
      ]
    }
  },
  "columns": {
    "data": {
      "section": "الفرق",
      "arrangement": "two-column",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "نفس الفكرة بطريقتين"
        },
        {
          "id": "a",
          "kind": "card",
          "at": {
            "frame": 14
          },
          "title": "شرح طويل",
          "body": "كل التفاصيل مرة واحدة من غير ترتيب"
        },
        {
          "id": "b",
          "kind": "card",
          "at": {
            "frame": 26
          },
          "title": "فكرة واحدة",
          "body": "جملة واضحة وبعدها مثال",
          "emphasis": true
        },
        {
          "id": "l",
          "kind": "line",
          "at": {
            "frame": 50
          },
          "text": "الفرق في الترتيب مش في الكلام"
        }
      ]
    }
  },
  "grid": {
    "data": {
      "section": "الحكم",
      "arrangement": "grid",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "الأداة دي تستاهل؟"
        },
        {
          "id": "n",
          "kind": "number",
          "at": {
            "frame": 12
          },
          "value": 9,
          "suffix": "/10",
          "label": "السهولة"
        },
        {
          "id": "r",
          "kind": "ring",
          "at": {
            "frame": 20
          },
          "value": 72,
          "max": 100,
          "label": "نسبة الإكمال"
        },
        {
          "id": "m",
          "kind": "marks",
          "at": {
            "frame": 30
          },
          "mark": "check",
          "label": "تنفع للمبتدئين"
        },
        {
          "id": "s",
          "kind": "card",
          "at": {
            "frame": 40
          },
          "variant": "stamp",
          "title": "تستاهل",
          "pressFrame": 52
        }
      ]
    },
    "split": {
      "section": "الحكم",
      "arrangement": "grid",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "الأداة دي تستاهل؟"
        },
        {
          "id": "n",
          "kind": "number",
          "at": {
            "frame": 12
          },
          "value": 9,
          "suffix": "/10",
          "label": "السهولة"
        },
        {
          "id": "r",
          "kind": "ring",
          "at": {
            "frame": 20
          },
          "value": 72,
          "max": 100,
          "label": "نسبة الإكمال"
        }
      ]
    }
  },
  "follow": {
    "data": {
      "section": "تابعنا",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "كل أسبوع فكرة جديدة"
        },
        {
          "id": "b",
          "kind": "body",
          "at": {
            "frame": 10
          },
          "text": "بنشرح خطوة واحدة في كل فيديو، من غير كلام كتير"
        },
        {
          "id": "c",
          "kind": "card",
          "at": {
            "frame": 22
          },
          "variant": "follow",
          "title": "@sample",
          "body": "حساب توضيحي للمعاينة",
          "value": "متابعة",
          "pressFrame": 70
        }
      ]
    }
  },
  "photo": {
    "data": {
      "section": "من الكواليس",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "صورة من المتجر"
        },
        {
          "id": "m",
          "kind": "media",
          "at": {
            "frame": 8
          },
          "source": {
            "kind": "image",
            "src": "projects/pilot/shop.jpg",
            "width": 600,
            "height": 1067
          },
          "caption": "صورة توضيحية"
        }
      ]
    }
  },
  "number-en": {
    "words": [
      {
        "sourceIndex": 3,
        "fromFrame": 14,
        "toFrame": 26
      }
    ],
    "data": {
      "section": "Numbers",
      "arrangement": "hero",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "By the numbers"
        },
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 4
          },
          "text": "One month later"
        },
        {
          "id": "n",
          "kind": "number",
          "at": {
            "word": 3
          },
          "value": 40000,
          "suffix": "+",
          "label": "views in the first week",
          "emphasis": true
        },
        {
          "id": "l",
          "kind": "line",
          "at": {
            "frame": 60
          },
          "text": "Illustrative figure for the preview"
        }
      ]
    }
  },
  "quote-en": {
    "data": {
      "section": "From the episode",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "The guest"
        },
        {
          "id": "q",
          "kind": "quote",
          "at": {
            "frame": 8
          },
          "text": "A clear idea cuts half the explaining; the rest is detail",
          "speaker": "Guest name",
          "role": "Episode guest"
        },
        {
          "id": "r",
          "kind": "rule",
          "at": {
            "frame": 50
          }
        }
      ]
    }
  },
  "list-en": {
    "data": {
      "section": "Before posting",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "Before you post, check these three"
        },
        {
          "id": "l",
          "kind": "list",
          "at": {
            "frame": 16
          },
          "staggerFrames": 14,
          "items": [
            {
              "text": "A first line that hooks",
              "detail": "In the first three seconds",
              "mark": "check"
            },
            {
              "text": "Clean sound",
              "detail": "No echo, no noise",
              "mark": "check"
            },
            {
              "text": "An ending that lands",
              "detail": "Not a sudden cut",
              "mark": "cross"
            }
          ]
        }
      ]
    }
  },
  "chat-en": {
    "data": {
      "section": "Messages",
      "arrangement": "stack",
      "parts": [
        {
          "id": "k",
          "kind": "kicker",
          "at": {
            "frame": 0
          },
          "text": "A question I got"
        },
        {
          "id": "c",
          "kind": "chat",
          "at": {
            "frame": 8
          },
          "messages": [
            {
              "from": "them",
              "text": "Where do I start with no experience?",
              "offsetFrames": 0
            },
            {
              "from": "me",
              "text": "Start with one idea",
              "offsetFrames": 26
            },
            {
              "from": "them",
              "text": "So one video a day is enough?",
              "offsetFrames": 52
            }
          ]
        }
      ]
    }
  },
  "timeline-en": {
    "data": {
      "section": "The method",
      "arrangement": "stack",
      "parts": [
        {
          "id": "h",
          "kind": "headline",
          "at": {
            "frame": 0
          },
          "text": "Four steps to a first video"
        },
        {
          "id": "s",
          "kind": "steps",
          "at": {
            "frame": 14
          },
          "items": [
            {
              "title": "Pick the idea",
              "detail": "One sentence sums it up",
              "offsetFrames": 0
            },
            {
              "title": "Write the opening",
              "detail": "The first three seconds",
              "offsetFrames": 16
            },
            {
              "title": "Film in one take",
              "detail": "Do not stop",
              "offsetFrames": 32
            },
            {
              "title": "Review and post",
              "detail": "Watch it as a viewer",
              "offsetFrames": 48
            }
          ]
        }
      ]
    }
  }
};


test('the approved sample pages exercise all sixteen part kinds', () => {
  const kinds = new Set(Object.values(pilotPages).flatMap(sample => sample.data.parts.map(part => part.kind)));
  assert.deepEqual([...kinds].sort(), [...PART_KINDS].sort());
});
for (const [name, sample] of Object.entries(pilotPages)) for (const layout of ['takeover', 'split']) for (const frame of [0, 125, 149]) {
  test(`approved pilot ${name} ${layout} @${frame} preserves valid magazine markup`, () => {
    const data = layout === 'split' && sample.split ? sample.split : sample.data;
    const input = composeSceneSchema.parse(scene(layout, data));
    const html = renderer.renderScene({scene: input, style: 'magazine-interview', frame, words: sample.words ?? []});
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /data-style-system="magazine-interview"/);
    if (name.endsWith('-en')) assert.match(html, /text-align:left/);
    if (name === 'follow') assert.match(html, /<bdi dir="auto">@sample<\/bdi>/);
  });
}

test('cream compose pages use the existing cream ground and navy screen paper', () => {
  const html = renderer.renderScene({scene: scene('takeover', {...pilotPages.screen.data, paper: 'cream'}), style: 'magazine-interview', frame: 125});
  assert.match(html, /#F5F0E4/i);
  assert.match(html, /#081321/i);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('a compose clip uses SceneClip with omitted fit and trim defaults', () => {
  const data = {arrangement: 'stack', parts: [{id: 'm', kind: 'media', at: {frame: 12}, source: {kind: 'clip', clip: {
    src: 'projects/demo/clip.mp4', sha256: 'a'.repeat(64), width: 1920, height: 1080,
  }}}]};
  const html = renderer.renderScene({scene: scene('takeover', data), style: 'magazine-interview', frame: 40});
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  assert.match(html, /projects\/demo\/clip.mp4/);
  assert.doesNotMatch(html, />SceneClip</);
  const before = renderer.renderScene({scene: scene('takeover', data), style: 'magazine-interview', frame: 0});
  assert.doesNotMatch(before, /projects\/demo\/clip.mp4/);
});

test('chat self-fit keeps the 46px floor when an odd starting size cannot fit', async () => {
  const api = await bundleEngine(`
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {ChatPart} from './engine/src/styles/magazine-interview/system/parts/chat';
    import {NAVY,MagazineScope} from './engine/src/styles/magazine-interview/system/base';
    export const render=()=>renderToStaticMarkup(<MagazineScope data={{text:'Question'}}><ChatPart
      part={{messages:[{from:'them',text:'Question',offsetFrames:0},{from:'me',text:'Answer',offsetFrames:1}]}}
      box={{x:0,y:0,width:950,height:1}} at={0} emphasis={false} th={NAVY} dir="ltr" fps={30} scale={1.15}/></MagazineScope>);
  `, {ssr: true});
  setSsrFrame(100);
  const html = api.render();
  const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length >= 2);
  assert.ok(sizes.every(size => size >= 46), `chat sizes below the approved floor: ${sizes.join(',')}`);
});

// Shift only the isolated test scenes so the page furniture (settled at frame 38)
// cannot be confused with the part's own motion. Absolute press cues shift with them.
const timingEdges = Object.fromEntries([
  {id: 'unit', kind: 'number', value: 12, label: 'Value', unit: 'Unit', rollFrames: 1},
  {id: 'long-roll', kind: 'number', value: 12, rollFrames: 180},
  {id: 'marked-headline', kind: 'headline', text: 'One headline with several words to reveal', emphasis: true},
  {id: 'body', kind: 'body', text: 'One paragraph with several whole words to reveal in order'},
  {id: 'bars', kind: 'bars', unit: 'Unit', items: [{label: 'A', value: 1, offsetFrames: 80}, {label: 'B', value: 2}, {label: 'C', value: 3}, {label: 'D', value: 4}, {label: 'E', value: 5}]},
  {id: 'ring', kind: 'ring', value: 30, max: 100},
  {id: 'quote', kind: 'quote', text: 'A longer quotation with several whole words to reveal before the speaker settles', speaker: 'Speaker', role: 'Role'},
  {id: 'list', kind: 'list', staggerFrames: 15, items: [{text: 'First', mark: 'cross'}, {text: 'Second', mark: 'none'}]},
  {id: 'input', kind: 'card', variant: 'input', title: 'Input'},
  {id: 'plain', kind: 'card', title: 'Plain', value: '42', pressFrame: 80},
  {id: 'ticket', kind: 'card', variant: 'ticket', title: 'Ticket', value: '42', pressFrame: 140},
  {id: 'follow', kind: 'card', variant: 'follow', title: '@sample', value: 'Follow', pressFrame: 80},
  {id: 'stamp', kind: 'card', variant: 'stamp', title: 'Stamp'},
  {id: 'explicit-stamp', kind: 'card', variant: 'stamp', title: 'Stamp', pressFrame: 80},
  {id: 'chat', kind: 'chat', messages: [{from: 'them', text: 'A longer message with several whole words to reveal', offsetFrames: 0}, {from: 'me', text: 'Another message with several whole words to reveal', offsetFrames: 30}]},
  {id: 'comments', kind: 'chat', messages: [{from:'them',author:'First author',text:'A comment with several words',offsetFrames:0},{from:'them',author:'Last author',text:'Another comment to read',offsetFrames:35}]},
  {id: 'screen', kind: 'screen', page: 'web', title: 'Title', url: 'sample.test', focus: 5, blocks: Array.from({length: 6}, (_, i) => ({kind: 'text', text: `Block ${i}`}))},
  {id: 'steps', kind: 'steps', items: [{title: 'First', offsetFrames: 0, image: 'projects/demo/first.png'}, {title: 'Second', offsetFrames: 20}]},
  {id: 'image', kind: 'media', source: {kind: 'image', src: 'projects/demo/image.png', width: 960, height: 540}, caption: 'Caption'},
  {id: 'compare', kind: 'media', source: {kind: 'compare', before: {src: 'projects/demo/a.png', width: 960, height: 540, label: 'A'}, after: {src: 'projects/demo/b.png', width: 960, height: 540, label: 'B'}, revealFrames: 1}, caption: 'Caption'},
  {id: 'clip', kind: 'media', source: {kind: 'clip', clip: {src: 'projects/demo/clip.mp4', sha256: 'a'.repeat(64), width: 1920, height: 1080}}, caption: 'Caption'},
  {id: 'marks', kind: 'marks', mark: 'cross'},
  {id: 'pair', kind: 'media', source: {kind:'pair',images:[{src:'projects/demo/a.png',label:'Before'},{src:'projects/demo/b.png',label:'After'}]}},
  {id: 'sequence', kind: 'media', source: {kind:'sequence',steps:[{offsetFrames:0,still:'projects/demo/a.png',title:'First'},{offsetFrames:60,still:'projects/demo/b.png',title:'Last'}]}},
].map(part => [`edge-${part.id}`, {data: {parts: [{...part, at: {frame: 10}}]}}]));
for (const [name, sample] of Object.entries({...pilotPages, ...timingEdges})) for (const original of sample.data.parts) {
  test(`motion lock: ${name}/${original.id} (${original.kind})`, () => {
    const originalAt = resolveComposeAt(original.at, {fromFrame: 0, durationInFrames: 150}, sample.words ?? [], 30);
    assert.notEqual(originalAt, null);
    const part = {...structuredClone(original), at: {frame: originalAt + 100}};
    if (part.pressFrame !== undefined) part.pressFrame += 100;
    const span = partSpan(part, 30);
    assert.ok(Number.isFinite(span));
    const input = {...scene('takeover', {arrangement: 'stack', parts: [part]}), durationInFrames: 1200};
    const first = renderer.renderScene({scene: input, style: 'magazine-interview', frame: part.at.frame + span});
    const later = renderer.renderScene({scene: input, style: 'magazine-interview', frame: part.at.frame + span + 20});
    assertFrozen(first, later, `${name}/${part.id} still changes after span ${span}`);
  });
}

test('only the explicitly marked input caret may remain idle during the hold', () => {
  const part = {id: 'input', kind: 'card', variant: 'input', title: 'Input', at: {frame: 100}};
  assert.equal(partSpan(part, 30), 30);
  const input = {...scene('takeover', {arrangement: 'stack', parts: [part]}), durationInFrames: 1200};
  const first = renderer.renderScene({scene: input, style: 'magazine-interview', frame: 200});
  const later = renderer.renderScene({scene: input, style: 'magazine-interview', frame: 220});
  assert.match(first, /data-idle="caret"/);
  assert.ok(first !== later, 'the approved caret must still blink');
  assertFrozen(first, later, 'only the caret style may change');
  assert.throws(() => assertFrozen(first.replaceAll(' data-idle="caret"', ''), later.replaceAll(' data-idle="caret"', ''), 'unmarked continuous motion'), /unmarked continuous motion/);
});

test('every accepted pilot page is frozen throughout the reading hold', t => {
  let accepted = 0;
  const rejected = [];
  for (const [name, sample] of Object.entries(pilotPages)) for (const layout of ['takeover', 'split']) {
    const input = scene(layout, layout === 'split' && sample.split ? sample.split : sample.data);
    const issues = validateComposeTiming(input, 30, sample.words ?? []);
    if (issues.length) {
      rejected.push({name, layout, parts: input.data.parts.flatMap(part => {
        const at = resolveComposeAt(part.at, input, sample.words ?? [], 30);
        const span = partSpan({...part, at: {frame: at}}, 30);
        return at + span > input.durationInFrames - composeHoldFrames(30) ? [{id: part.id, at, span, end: at + span, latestEnd: 120}] : [];
      }), issues});
      continue;
    }
    const options = {scene: input, style: 'magazine-interview', words: sample.words ?? []};
    const hold = input.durationInFrames - composeHoldFrames(30);
    const settled = renderer.renderScene({...options, frame: hold});
    for (let frame = hold + 1; frame < input.durationInFrames; frame++) {
      assertFrozen(renderer.renderScene({...options, frame}), settled, `${name}/${layout} changes during hold at ${frame}`);
    }
    accepted++;
  }
  assert.ok(accepted > 0);
  t.diagnostic(JSON.stringify({pilotTiming: {accepted, rejected}}));
});

for (const [layout, durationInFrames] of [['takeover', 68], ['split', 56]]) {
  test(`the shortest accepted ${layout} rule page also holds its furniture`, () => {
    const input = {...scene(layout, {arrangement: 'stack', parts: [{id: 'r', kind: 'rule', at: {frame: 0}}]}), durationInFrames};
    assert.deepEqual(validateComposeTiming(input, 30, []), []);
    const hold = durationInFrames - composeHoldFrames(30);
    const first = renderer.renderScene({scene: input, style: 'magazine-interview', frame: hold});
    for (let frame = hold + 1; frame < durationInFrames; frame++) {
      assertFrozen(renderer.renderScene({scene: input, style: 'magazine-interview', frame}), first, `${layout} furniture moves at ${frame}`);
    }
  });
}

const paperApi = await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {MAGAZINE_INTERVIEW_DESIGNS} from './engine/src/styles/magazine-interview/designs';
  import {CAPTION_DESIGNS} from './engine/src/styles/caption-designs';
  export const render=(paper,layout,sectionIndex)=>{
    const data={arrangement:'stack',parts:[{id:'h',kind:'headline',at:{frame:0},text:'Headline'}],...(paper===undefined?{}:{paper})};
    const scene={id:'paper',family:'compose',fromFrame:0,durationInFrames:150,layout,motion:'land',data};
    const Page=MAGAZINE_INTERVIEW_DESIGNS.compose;
    return {page:renderToStaticMarkup(<Page scene={scene} sectionIndex={sectionIndex} style="magazine-interview" seam={1080} geometry={{}} aspect={1}/>),
      caption:renderToStaticMarkup(<CAPTION_DESIGNS.magazine scene={scene} text="Caption" center={1300}/>)};
  };
`, {ssr: true});

for (const paper of [undefined, 'auto', 'navy', 'cream']) for (const layout of ['takeover', 'split']) {
  test(`compose paper/caption contrast: ${paper ?? 'unset'}/${layout}/section 2`, () => {
    setSsrFrame(125);
    const html = paperApi.render(paper, layout, 2);
    assert.match(html.page, paper === 'cream' ? /background:#F5F0E4/i : /background:#081321/i);
    const creamCaption = layout === 'takeover' && paper === 'cream';
    assert.match(html.caption, creamCaption ? /color:#0B1A2C/i : /color:#F5F3EC/i);
    if (layout === 'split') assert.match(html.caption, /text-shadow:0 2px 18px rgba\(0,0,0,0.65\)/);
    else assert.doesNotMatch(html.caption, /text-shadow:/);
  });
}

const polishApi=await bundleEngine(`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {MagazineComposePage} from './engine/src/styles/magazine-interview/system/compose';
 import * as budget from './engine/src/creative-kit/compose/budget';
 import {fit,wid,MagazineScope,NAVY} from './engine/src/styles/magazine-interview/system/base';
 import {LinePart} from './engine/src/styles/magazine-interview/system/parts/line';
 import {cardLayout} from './engine/src/styles/magazine-interview/system/parts/card';
 import {ChatPart} from './engine/src/styles/magazine-interview/system/parts/chat';
 import {StepsPart} from './engine/src/styles/magazine-interview/system/parts/steps';
 import {tokenLensToCompose,commentStackToCompose,routeStopsToCompose} from './engine/src/creative-kit/compose/adapters/semantic';
 import {screensToCompose} from './engine/src/creative-kit/compose/adapters/kinetic';
 import {pickScale} from './engine/src/creative-kit/compose/layout';
 import {magazineZones} from './engine/src/styles/magazine-interview/system/zones';
 export const stub=(text,width=950)=>{const plan=budget.ticketStubPlan(text,width,(t,s,numeric)=>wid(t,s,numeric?400:600,numeric?"'Source Serif 4', Alexandria, serif":'Alexandria'));return {...plan,widths:plan.lines.map(t=>wid(t,plan.size,plan.numeric?400:600,plan.numeric?"'Source Serif 4', Alexandria, serif":'Alexandria'))};};
 export const adapt=(family,scene)=>({ 'token-lens':tokenLensToCompose,'comment-stack':commentStackToCompose,'route-stops':routeStopsToCompose,'screens':screensToCompose }[family](scene));
 export const layout=(data,mode)=>pickScale(data,magazineZones(1080)[mode],'rtl');
 export const routeBounds=data=>{const plan=pickScale(data,magazineZones(1080).split,'rtl'),box=plan.placed.boxes.foot,part=data.parts.find(p=>p.id==='foot'),text=fit(part.text,{width:box.width-40,size:44,min:34,lines:1,weight:500},'Alexandria');return {box,text,textTop:box.y+(box.height-text.box)/2,textBottom:box.y+(box.height+text.box)/2,zoneBottom:992};};
 export const page=(data,layout)=>renderToStaticMarkup(<MagazineComposePage scene={{id:'polish',family:'compose',fromFrame:0,durationInFrames:360,layout,motion:'land',data}} data={data} seam={1080} geometry={{}} aspect={1}/>);
 export const line=text=>renderToStaticMarkup(<MagazineScope data={{text}}><LinePart part={{kind:'line',text}} box={{x:0,y:0,width:788,height:150}} at={0} th={NAVY} scale={1}/></MagazineScope>);
 export const title=part=>cardLayout(part,950,700,1.8,true,'Alexandria').title;
 export const chat=part=>renderToStaticMarkup(<MagazineScope data={{text:'عنوان'}}><ChatPart part={part} box={{x:0,y:0,width:950,height:500}} at={0} th={NAVY} scale={1}/></MagazineScope>);
 export const stepPlan=(data,mode)=>{const plan=pickScale(data,magazineZones(1080)[mode],'rtl'),part=data.parts.find(p=>p.kind==='steps');return {...plan,html:renderToStaticMarkup(<MagazineScope data={{text:'عنوان'}}><StepsPart part={part} box={plan.placed.boxes[part.id]} at={0} th={NAVY} scale={plan.scale}/></MagazineScope>)};};
 export const fixedSteps=part=>{const natural=budget.stepsMetrics(part,950,1).natural,height=Math.round(natural*0.9);return {natural,height,html:renderToStaticMarkup(<MagazineScope data={{text:'عنوان'}}><StepsPart part={part} box={{x:0,y:0,width:950,height}} at={0} th={NAVY} scale={1}/></MagazineScope>)};};
`,{ssr:true,media:true,timeline:true,plateStub:true});
const {ARABIC_SCENES:polishSamples}=await import('./fixtures/arabic-scenes.mjs');

test('ticket stubs self-fit in two bounded lines',()=>{
 for(const text of ['٢٠٪','42','جلسة 1','SESSION','A nice tag with room for a label']){
   const p=polishApi.stub(text);assert.ok(p.lines.length<=2);assert.ok(p.widths.every(w=>w<=p.width-32+0.5),JSON.stringify({text,p}));assert.ok(p.size>=30&&p.size<=54);
 }
 assert.equal(polishApi.stub('42').numeric,true);assert.equal(polishApi.stub('SESSION').numeric,false);
 for(const text of ['جلسة 1','SESSION'])assert.equal(polishApi.stub(text).lines.length,1,text);
});

test('comment authors have 12px breathing room and the budget counts each gap',()=>{
 setSsrFrame(200);
 const messages=[{from:'them',author:'متابع 1',text:'سؤال واضح',offsetFrames:0},{from:'them',author:'متابع 2',text:'تعليق آخر',offsetFrames:20}];
 const html=polishApi.chat({kind:'chat',messages});
 const authorTags=[...html.matchAll(/<div style="([^"]*)">متابع [12]<\/div>/g)].map(m=>m[1]);
 assert.equal(authorTags.length,2);assert.ok(authorTags.every(s=>/margin-bottom:12px/.test(s)),authorTags.join('\n'));
});

test('two-line ticket titles balance their last word; one-line titles stay single',()=>{
 const title=polishApi.title({variant:'ticket',title:'جلسة واحدة 30 دقيقة',value:'جلسة 1',body:'العرض الحقيقي 2024'});
 assert.equal(title.lines.length,2);assert.ok(title.lines.every(line=>line.includes(' ')),JSON.stringify(title));
 assert.equal(polishApi.title({title:'قبل'}).lines.length,1);
});

test('the drawn step numerals shrink with their row boxes',t=>{
 setSsrFrame(200);const base=polishSamples.find(s=>s.family==='route-stops'),data=polishApi.adapt(base.family,base);
 const split=polishApi.stepPlan(data,'split'),takeover=polishApi.stepPlan(data,'takeover');
 assert.equal(split.placed.overflow,35);assert.ok(split.shrink<1);
 const sizes=[...split.html.matchAll(/font-weight:200;font-size:(\d+)px/g)].map(m=>+m[1]);
 const effective=Math.max(0.8,split.placed.boxes.route.height/349);
 assert.equal(sizes.length,3);assert.ok(sizes.every(s=>s===Math.round(96*effective)),JSON.stringify(sizes));
 assert.equal(takeover.shrink,1);
 assert.ok([...takeover.html.matchAll(/font-weight:200;font-size:(\d+)px/g)].every(m=>+m[1]>=96));
 const four={...base,data:{kicker:'لوحة',title:'العنوان',stops:Array.from({length:4},(_,i)=>({label:`محطة ${i+1}`,detail:'تفصيل',atFrame:i*20})),footer:'ملاحظة'}};
 const small=polishApi.stepPlan(polishApi.adapt(base.family,four),'split');
 assert.equal(small.placed.overflow,79);assert.equal(small.shrink,0.5);
 const type=[...small.html.matchAll(/font-size:(\d+)px;line-height:(\d+)px/g)].map(m=>({size:+m[1],box:+m[2]}));
 assert.equal(type[0].size,95);
 t.diagnostic(JSON.stringify({fourStepRows:{rowHeight:small.placed.boxes.route.height/4,firstNumber:type[0],firstTitle:type[1],firstDetail:type[2]}}));
});

const stepRows=html=>{
 const px=(style,key)=>Number(style.match(new RegExp('(?:^|;)'+key+':(-?[\\d.]+)'))?.[1]??0);
 const rows=[...html.matchAll(/<div style="(position:absolute;top:[^"]*direction:[^;]+;white-space:nowrap[^"]*)"><div style="([^"]*)">([^<]*)<\/div>(?:<div style="([^"]*)">([^<]*)<\/div>)?<\/div>/g)].map(m=>{
  const top=px(m[1],'top'),titleBox=px(m[2],'line-height'),detailBox=px(m[4]??'','line-height');
  return {top,titleBox,detailBox,bottom:top+titleBox+detailBox,titleSize:px(m[2],'font-size'),detailSize:px(m[4]??'','font-size')};
 });
 const rules=[...html.matchAll(/<div style="(position:absolute;top:[^"]*;height:1px;background:[^"]*)"/g)].map(m=>px(m[1],'top'));
 return {rows,rules};
};

const rowThree=polishSamples.find(s=>s.family==='route-stops');
const rowFour={...structuredClone(rowThree),data:{...rowThree.data,stops:[...rowThree.data.stops,{label:'التسليم',detail:'انشر 4',atFrame:74}]}};
for(const [name,sample]of [['three',rowThree],['four',rowFour]])test(`short steps keep every text block ten pixels clear of both row rules: ${name}`,t=>{
 setSsrFrame(200);
  const data=polishApi.adapt(sample.family,sample),result=polishApi.stepPlan(data,'split'),{rows,rules}=stepRows(result.html),rowHeight=result.placed.boxes.route.height/sample.data.stops.length;
  assert.equal(rows.length,sample.data.stops.length,name);assert.equal(rules.length,rows.length-1,name);
  t.diagnostic(JSON.stringify({safeStepRows:{name,scale:result.scale,shrink:result.shrink,overflow:result.placed.overflow,rowHeight,rows,rules}}));
  for(let i=0;i<rows.length;i++){
   const bottom=rules[i]??rowHeight*rows.length;
   assert.ok(bottom-rows[i].bottom>=10-1e-7,`${name} row ${i}: detail-to-rule clearance ${bottom-rows[i].bottom}`);
   const above=i?rules[i-1]:0;
   assert.ok(rows[i].top-above>=10-1e-7,`${name} row ${i}: rule-to-title clearance ${rows[i].top-above}`);
  }
});

test('a row below its scale-one height uses both minimum text sizes',()=>{
 setSsrFrame(200);
 const part={kind:'steps',items:[{title:'First',detail:'One two few red bit six row end fit new box',offsetFrames:0},{title:'Next',detail:'One two few red bit six row end fit new box',offsetFrames:20}]};
 const result=polishApi.fixedSteps(part),{rows}=stepRows(result.html);
 assert.ok(result.height<result.natural);assert.equal(rows.length,2);
 assert.ok(rows.every(row=>row.titleSize===40&&row.detailSize===34),JSON.stringify(rows));
});

test('token lens row card frames share one height and top',()=>{
 setSsrFrame(200);
 const base=polishSamples.find(s=>s.family==='token-lens');
 for(const layout of ['split','takeover']){
  for(const arrangement of ['grid','two-column']){
  const warnings=[],warn=console.warn;let html;
  try{console.warn=(...args)=>warnings.push(args.join(' '));html=polishApi.page({...polishApi.adapt('token-lens',{...base,layout}),arrangement},layout);}finally{console.warn=warn;}
  assert.ok(!warnings.some(w=>w.includes('overflow')),warnings.join('\n'));
  const frames=[...html.matchAll(/<div style="position:absolute;left:[^;]+;top:([^;]+);width:461px;height:([^;]+)"><div style="position:absolute;left:0;top:([^;]+);width:461px;height:([^;]+)"><svg/g)].map(m=>({top:parseFloat(m[1])+parseFloat(m[3]),height:parseFloat(m[4])}));
  assert.equal(frames.length,2,html);assert.deepEqual(frames[0],frames[1]);
  }
 }
});

test('fixture comment thread fits both layouts; stress and route report measured geometry',t=>{
 for(const layout of ['split','takeover']){
  const base=polishSamples.find(s=>s.family==='comment-stack');const data=polishApi.adapt(base.family,{...base,layout});
  assert.equal(polishApi.layout(data,layout).placed.overflow,0,layout);
 }
 const base=polishSamples.find(s=>s.family==='comment-stack');const stress={...base,data:{...base.data,comments:Array.from({length:3},(_,i)=>({author:'قارئ',text:'تعليق للقارئ '.repeat(8).slice(0,88),atFrame:i*20}))}};
 assert.ok(stress.data.comments.every(c=>c.text.length===88));
 t.diagnostic(JSON.stringify({stressCommentSplit:polishApi.layout(polishApi.adapt(base.family,stress),'split')}));
 const route=polishSamples.find(s=>s.family==='route-stops');t.diagnostic(JSON.stringify({route:polishApi.layout(polishApi.adapt(route.family,route),'split')}));
 t.diagnostic(JSON.stringify({routeBounds:polishApi.routeBounds(polishApi.adapt(route.family,route))}));
});

test('sequence uses full landscape column and an in-plate copy-side tag',()=>{
 setSsrFrame(200);const base=polishSamples.find(s=>s.family==='screens');
 for(const layout of ['split','takeover']){
  const html=polishApi.page(polishApi.adapt('screens',{...base,layout}),layout);
  const plate=html.match(/data-adapter-plate="sequence" style="[^"]*left:([^;]+);top:([^;]+);width:([^;]+);height:([^;]+)/);
  assert.ok(plate,html);assert.equal(parseFloat(plate[3]),950,layout);assert.equal(parseFloat(plate[1]),0);assert.equal(parseFloat(plate[2]),0);
  assert.match(html,/top:18px;right:18px;padding:4px 16px;background:#081321;color:#F3C776;font-family:Alexandria;font-weight:700;font-size:32px/);
 }
});

test('long foot wraps at minimum size while short lines keep one mask',()=>{
 setSsrFrame(200);const html=polishApi.line('Illustrative images: replace with your actual evidence');
 assert.equal((html.match(/data-type-mask/g)||[]).length||((html.match(/white-space:nowrap/g)||[]).length),2);
 assert.doesNotMatch(html,/font-size:(?:[12]\d|3[0-3])px/);
 assert.equal((polishApi.line('Source').match(/white-space:nowrap/g)||[]).length,1);
});

// Task 21 round 3: only columns' emphasized card palette changes in both layouts.
test('pilot geometry audit for the polish lane',async t=>{
 const {createHash}=await import('node:crypto');const audit=[];
 for(const [name,sample] of Object.entries(pilotPages))for(const layout of ['split','takeover']){
  const data=layout==='split'&&sample.split?sample.split:sample.data;
  const html=renderer.renderScene({scene:scene(layout,data),style:'magazine-interview',frame:149,words:sample.words??[]});
  const frames=[...html.matchAll(/<div style="position:absolute;left:([^;]+);top:([^;]+);width:([^;]+);height:([^;]+)"><div style="position:absolute;left:0;top:([^;]+);width:[^;]+;height:([^;]+)"><svg/g)].map(m=>({x:parseFloat(m[1]),top:parseFloat(m[2])+parseFloat(m[5]),height:parseFloat(m[6])}));
  audit.push({name,layout,sha256:createHash('sha256').update(html).digest('hex'),frames});
 }
 assert.deepEqual(audit.map(p=>[p.name,p.layout,p.sha256]),[["number","split","92520005870b9276626b43e242c4007f5ee7a9c7e5f120f8c9a2e9836525a490"],["number","takeover","06bc53f3ac435da468ea1dc0235f438cda87539d1aa8b7878f012e5dd681c3f6"],["quote","split","2cc24f9919731ddd3fae129620ff815707427167d6c4b703da688962f0a04266"],["quote","takeover","57998a1c9ceaa0e30f082d1f4be5bc1f0578edf33f04ebc9c1df93b7fae5a2ec"],["list","split","40fbe30a886069034ac3ff9424f633a0c68870a70ecccce7a2ca911cbe65d0e6"],["list","takeover","edc76ad688c4e178631c6c18efbe0a9b35b9f9538ea9f366cb556e04765328fb"],["compare","split","aee3595b871a0d0938b4dd6ca4d5b74d6a0436be5fd5e249ff7a097f8dd13082"],["compare","takeover","e530c6222c44cdb3374c02dd5d4b2540ff5c006b5970797c4dd822d4ea3c898a"],["chart","split","1998afc1af67937bf06fecae37cd7ca0717c8998cbb2ebe64efd9dbab5ae5a22"],["chart","takeover","89ce45f34502a0b5d65c9a57a59f1fb645a048ca50bd2ca3a317867cd9b30ec0"],["chat","split","99cc602b6d8259693eff3ee4c087aa1ba65f9f526862131af7840d9c4b8cc4d5"],["chat","takeover","7b5abc34f9f9db95b6660467871fa22cedb2c5b681be06743b4a7c94af75e161"],["screen","split","300affa84769b4f87308a9ed697cdecb780bb6b48e24dc80504ce1b6dde88321"],["screen","takeover","989e84b8f4f5d16791cedcea5ca371ba534d00abdcc97ad66f066b4b2fbf2ef0"],["timeline","split","b2e12ba89f6686f47ce90e08417bee266d1b336cad47a747a67c80601fb5029a"],["timeline","takeover","a232883bdcc8f08c48ad36fff266fe5008358919c7c78e9c20408363bba80a59"],["columns","split","5972aa7c2f27737a91070d76d30f4c8fc593200ba653100ed41cf68c2392cdea"],["columns","takeover","969d54b321c2ecaa134cac26ae83f6e3be38a883902a6aea2d3cb737eb082bb7"],["grid","split","202be80111119de4b3936f4d1755749739969be958bdccc0878ee7b9e2031237"],["grid","takeover","5016ec2bdc4ae024621bfaa72f95c8da41798c901c72d90b32d08c2ebbdf7daf"],["follow","split","2ae67805bd8124d61ee741ec7748cc0bb1295456d6920a7326e962d8d0efdf54"],["follow","takeover","41faf65a19279fb36ffa08ab26731d1b43cb35d6bec87c5694cde72919e0aa8a"],["photo","split","216bf78ca43bcea6df9fb6fdef4811f670443ccc69fb6bd879e63b8435765613"],["photo","takeover","c94b182f227ee26cff941661fc4abad41ae46d05e0906cd82970eaacbc43fe67"],["number-en","split","ea5bff0e88cb267c85a1e95d603b5b14d0c9c3ed0a4fa88c172f03a2905b6f96"],["number-en","takeover","e263532191523789d2d497b9782295ca8e2fdfd36d33bda838b4adcf76727d48"],["quote-en","split","038e7a587c1b783722d906bb055e47638c21b0ed183b75944647abcbda0f02f9"],["quote-en","takeover","c2ad4326eb374677fe526c979ebc87610bfff4f3020b5df62c4d7ea48acb998c"],["list-en","split","833652b966f6e1b2246f70db95b283952e5ee206fe2a2fe0a948b1eb4c1e7986"],["list-en","takeover","c582370d67be57e94d03780712278fb6845993dd23db9c6c6bc86ef43cde1a00"],["chat-en","split","dfebcf8206ee7c64e583d1cda7c5b9ac01ac95a07cbb0f0a2ab821a51b7c798e"],["chat-en","takeover","8c58697feae710bb4af096159a1e3ce3afe0cec435f608083b3da0dab9b672d7"],["timeline-en","split","52338ec695f90d6bc0d132dc4f3e4ec2bc348700d3b01bf853095e75e7ce35d1"],["timeline-en","takeover","ed091f4f68da6fb1479615222cc69620979fd62adb577c96e1b93c9c5ea173af"]]);
 t.diagnostic(JSON.stringify({pilotPolish:audit}));
});

test('unshrunk steps preservation audit',async t=>{
 const {createHash}=await import('node:crypto');const audit=[];
 const process=polishSamples.find(s=>s.family==='process');
 const cases=[['process-split',{...process,layout:'split'}],['process-takeover',{...process,layout:'takeover'}],['route-three-takeover',{...rowThree,layout:'takeover'}],['route-four-takeover',{...rowFour,layout:'takeover'}]];
 for(const [name,input]of cases)for(const frame of [0,40,200]){
  const html=renderer.renderScene({scene:input,style:'magazine-interview',frame});
  audit.push({name,frame,sha256:createHash('sha256').update(html).digest('hex')});
 }
 assert.deepEqual(audit,[{"name":"process-split","frame":0,"sha256":"6409e7f0019472dfcf553db9bec3f4bf72fa88801ca6922677e404da0f2d741e"},{"name":"process-split","frame":40,"sha256":"1a2cb6322f720c802957ecd1dd3a3850cfc2226f4d02694da158b8424b6d4b43"},{"name":"process-split","frame":200,"sha256":"72429bbb85fb591a8a4f8aaac76c892dc80efca55826dff2f20f814b1d507ec1"},{"name":"process-takeover","frame":0,"sha256":"da5359348e5545518408be32331dde7a4b3af1b8ee31d8b439b994bcd74a6817"},{"name":"process-takeover","frame":40,"sha256":"4a3c89f6ab5ccf973cc68a4356632fa16a1005c5b2360d737c6a0be0698070cb"},{"name":"process-takeover","frame":200,"sha256":"3c9b08c93a2e67cdb036bee896b6127a4113053a717fa1f71c7f9c1b3b1324f9"},{"name":"route-three-takeover","frame":0,"sha256":"129c3fbf6af52aff439b12f9732032a35f9a5eda8e715357b4aa311193c61492"},{"name":"route-three-takeover","frame":40,"sha256":"a8bd24a2b1857c4995c6b15c8f0e51610a81d01788489a623f52da5f03793c73"},{"name":"route-three-takeover","frame":200,"sha256":"f3ea84db6ecfbf5ea4289526d49f640ac70f088c203aecb3ffeaf3b748a15966"},{"name":"route-four-takeover","frame":0,"sha256":"5c96ff4855d50c43373abd8486ff7f9fdc13bf4b2c82383b30ed393c5d009b8a"},{"name":"route-four-takeover","frame":40,"sha256":"ee472b1a0c6f697e8cdad8d5ba053d7a4c185824269b165035685147e0d7daf4"},{"name":"route-four-takeover","frame":200,"sha256":"da548afa5a80ce2499264813dc169d4069374cf913c99a1454c0fc6856f4da33"}]);
 t.diagnostic(JSON.stringify({keptSteps:audit}));
 for(const sample of [rowThree,rowFour]){
  const p=polishApi.stepPlan(polishApi.adapt(sample.family,sample),'takeover');
  t.diagnostic(JSON.stringify({takeoverRows:{count:sample.data.stops.length,scale:p.scale,shrink:p.shrink,box:p.placed.boxes.route,...stepRows(p.html)}}));
 }
});
