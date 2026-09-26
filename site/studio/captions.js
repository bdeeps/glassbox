// Post copy for every channel, written from the box manifest and storyboard.
// These are starting drafts: the studio lets you edit each one before saving.
const tagify = (s) => '#' + s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/)?.[0] || s).trim();

export function captions(box, idx, scenes, hist = null) {
  const site = `https://${idx.domain}`;
  const page = `${site}/e/${box.slug}/`;
  const short = `${idx.domain}/${box.slug}`;
  const ig = idx.handles.instagram ? `@${idx.handles.instagram}` : idx.brand;
  const tags = [...new Set([...idx.hashtags, ...box.tags].map(tagify))].filter((t) => t.length > 2);
  const lines = scenes.map((s) => `→ ${s.caption}`);
  const beats = box.explainer.map((b, i) => `${i + 1}. ${b.title}`);

  const hkeys = hist ? [...hist.events].filter((e) => e.key).sort((a, b) => a.year - b.year).slice(0, 6) : [];
  const yl = (y) => (y < 0 ? `${-y} BCE` : y);
  const history = hist ? {
    instagram: [
      hist.tagline,
      '',
      ...hkeys.map((e) => `${yl(e.year)}: ${e.title}`),
      '',
      `The full story, with ${hist.events.length} moments, sources and charts: ${idx.domain}/e/${box.slug}/history (link in bio)`,
      '',
      `Then play with how it works: ${short}`,
      '',
      tags.slice(0, 12).join(' ') + ' #history',
    ].join('\n'),
    youtube: {
      title: `${hist.title} in 45 seconds #shorts`,
      description: [
        hist.tagline,
        '',
        ...hkeys.map((e) => `${yl(e.year)} · ${e.title}${e.who ? ` (${e.who})` : ''}`),
        '',
        `▶ Full history: ${site}/e/${box.slug}/history/`,
        `▶ Play with it: ${page}`,
        '',
        tags.slice(0, 3).join(' ') + ' #history',
      ].join('\n'),
    },
  } : undefined;

  return {
    history,
    instagram: [
      box.question,
      '',
      box.hook,
      '',
      ...lines.slice(0, 5),
      '',
      `Play with it yourself. It's free and open source: ${short} (link in bio)`,
      '',
      `Box No. ${box.no} of 365. Follow ${ig} for a new "how it works" every day.`,
      '',
      tags.slice(0, 15).join(' '),
    ].join('\n'),

    carousel: [
      `Swipe through: ${box.question}`,
      '',
      box.hook,
      '',
      `Save this for later, then play with the interactive version at ${short} (link in bio).`,
      '',
      `Box No. ${box.no} · ${ig}`,
      '',
      tags.slice(0, 12).join(' '),
    ].join('\n'),

    youtube: {
      title: `${box.question} #shorts`,
      description: [
        box.hook,
        '',
        `▶ Play with it: ${page}`,
        `⌘ Source code (MIT): ${box.repo}`,
        '',
        `Box No. ${box.no} of 365 from ${idx.brand}: one open-source interactive explainer every day.`,
        '',
        tags.slice(0, 3).join(' '),
      ].join('\n'),
    },

    youtubeLong: {
      title: `${box.question} (interactive explainer)`,
      description: [
        box.hook,
        '',
        `▶ Play with the interactive version: ${page}`,
        `⌘ Source code (MIT): ${box.repo}`,
        '',
        'In this video:',
        ...box.explainer.map((b) => `• ${b.title}. ${firstSentence(b.text)}`),
        '',
        `${idx.brand} opens one box a day: an interactive model of how something works, plus the code behind it.`,
        '',
        tags.slice(0, 5).join(' '),
      ].join('\n'),
    },

    short: `${box.question}\n\n${firstSentence(box.hook)}\n\nPlay with it: ${page}`,

    linkedin: [
      box.question,
      '',
      box.hook,
      '',
      ...beats,
      '',
      `I built an interactive, open-source explainer so you can pull the levers yourself. It's box No. ${box.no} in my one-a-day project, ${idx.brand}.`,
      '',
      `Try it: ${page}`,
      `Code: ${box.repo}`,
      '',
      tags.slice(0, 5).join(' '),
    ].join('\n'),
  };
}

export const LIMITS = { 'history.instagram': 2200, 'history.youtube.title': 100, 'history.youtube.description': 5000, instagram: 2200, carousel: 2200, 'youtube.title': 100, 'youtube.description': 5000, 'youtubeLong.title': 100, 'youtubeLong.description': 5000, short: 280, linkedin: 3000 };
