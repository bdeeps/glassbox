# Contributing to Glassbox

Thank you for helping people see inside how things work.

## Spotted a mistake?

Explainers simplify on purpose, but they should never be wrong. Open an issue on
the box's own repository (linked from every explainer page), or use the
[correction form](https://github.com/glassboxhow/glassboxhow.github.io/issues/new?template=correction.yml)
here. Please say what's wrong, what's right, and a source if you have one.
Corrections are made in public, in the repository history.

## Want a box about something?

[Suggest a box](https://github.com/glassboxhow/glassboxhow.github.io/issues/new?template=box-idea.yml).
The best ideas are about something people use every day but can't explain.

## Code changes

- Keep it plain HTML, CSS and JavaScript, with no npm dependencies and no build step for boxes.
- **No third-party requests.** Self-host fonts and libraries; `npm run check` fails if a box loads from a CDN. The privacy policy promises this.
- **No data collection** of any kind: no analytics, cookies, forms or trackers. If a change would affect what the privacy page says, update `scripts/lib/legal.mjs` in the same pull request.
- Run `npm run check` and `npm run build` before opening a pull request.

## Licences

By contributing, you agree that your code is released under the MIT licence and
your text, images and media under CC BY 4.0, matching the rest of the project.
