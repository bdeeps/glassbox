# The history framework

Every box tells two stories: **how it works** (the box itself) and **how people figured it out** (its history). The history lives in the box repo as `history.json`. The hub turns it into:

- a visual history page at `/e/<slug>/history/`: era chapters, an alternating timeline with line-art illustrations, a sticky strip of every moment with a live year counter, log-scale charts, people, places and sources;
- a teaser on the explainer page;
- a place on the combined timeline at `/history/`, merged with every other box;
- search results (every moment is searchable);
- a "history in 10 moments" Reel/Short and a 10-slide carousel, made in the studio;
- a "A short history" section in the box's README.

`npm run new` creates a `history.json` stub, and `npm run check` validates it.

## `history.json`

```jsonc
{
  "title": "The history of the camera",
  "tagline": "2,400 years from a hole in the wall to the camera in your pocket.",
  "intro": "Two or three sentences setting up the whole story.",
  "eras": [                               // chapters; they may overlap in time
    { "id": "shadow", "name": "Light in a dark room", "from": -400, "to": 1700, "color": "#c49bff", "summary": "One or two sentences." }
  ],
  "events": [
    {
      "year": 1839,                       // integer; negative for BCE
      "date": "19 August 1839",           // how to show it: "c. 400 BCE", "1826 or 1827", "1011–1021"
      "era": "fix",
      "art": "daguerreotype",             // an illustration name (list below)
      "key": true,                        // key moments drive the reel, carousel, teaser and README
      "title": "Photography is given to the world",
      "who": "Louis Daguerre", "where": "Paris, France", "country": "France",
      "text": "What happened, in two or three plain sentences.",
      "why": "Why it mattered, in one sentence.",
      "box": "shutter",                   // optional: a chapter/anchor in the box, linked as “See it working”
      "sources": [7, 4]                   // indexes into "sources"
    }
  ],
  "firsts": [{ "label": "First surviving photograph", "value": "1826–27", "who": "Nicéphore Niépce, France" }],
  "people": [{ "name": "Anna Atkins", "life": "1799 – 1871", "role": "Botanist and photographer", "from": "England", "note": "One sentence." }],
  "series": [                             // charts; "after" places one after an era
    { "id": "speed", "title": "How quickly a camera could take a picture", "unit": "seconds", "log": true, "after": "film",
      "caption": "One sentence that says what the line shows.",
      "points": [{ "year": 1827, "value": 28800, "label": "Niépce's heliograph: 8 hours or more" }] }
  ],
  "facts": ["Short, surprising, true things."],
  "sources": [{ "title": "Daguerreotype", "publisher": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Daguerreotype" }]
}
```

`unit: "seconds"` gets human axis ticks (1 day, 1 hour, 1 min, 1/1,000 s). Any other unit gets powers of ten.

## Illustrations

`art` picks a line drawing from `site/assets/art.js`:

`obscura` `eclipse` `candles` `eye` `lens` `aperture` `reflex` `flask` `leaf` `plate` `window` `person` `daguerreotype` `selfie` `word` `colour` `studio` `horse` `boxcamera` `rangefinder` `flash` `instant` `pixels` `earth` `chip` `digital` `focus` `phone` `film` `night` `blackhole` `telescope`

New subjects will need new drawings. Add them to `art.js` (64×64 grid, `class="a"` for accent strokes, `class="f"` for accent fills), and every box can use them.

## Research standards

- **Every moment needs a source.** Prefer museums, encyclopaedias, universities, original publishers and prize committees. Wikipedia is fine as a starting point, but add a primary or institutional source for key moments.
- **Be honest about uncertainty.** Use "c." for approximate dates, give ranges ("1011–1021"), and say "attributed" or "widely considered" when historians disagree about who was first.
- **Tell a global story.** Look beyond Europe and the US. Say where things happened, and include the people, women among them, whom popular histories leave out.
- **Link history to the model.** When a moment explains something the box lets you play with, set `box` to that chapter's anchor.
- **Aim for 20–50 moments, 5–12 of them key**, 2–6 eras, one or two number series with real, labelled values, and 3–5 facts.
- **Keep sentences short and plain.** The same text becomes Reel captions and carousel slides.
