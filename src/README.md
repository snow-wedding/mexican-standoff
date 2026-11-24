# Editable source

`index.html` is a bundled page: the app code is packed inside it. These files are
the readable copies of our own code from that bundle:

- `app.dc.html`: the main page (War of the Chosen Team Builder: roster data, layout, logic)
- `Player Card.dc.html`: the player card component

React, fonts and the runtime stay packed inside `index.html`. We don't edit them.

## Workflow

```
node tools/bundle.js pack     # src/ -> index.html (run after editing)
node tools/bundle.js unpack   # index.html -> src/ (if index.html was replaced by a new export)
node tools/bundle.js check    # confirm src/ and index.html match
```

Commit `src/` and `index.html` together. Run `check` before committing.
