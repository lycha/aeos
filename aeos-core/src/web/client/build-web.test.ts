// Guards the SPA inlining against the two breakout bugs that render the page as
// visible text: `$` in the bundle being treated as a String.replace match
// reference, and `</script` forms the HTML parser treats as a closing tag.
// This covers scripts/build-web.mjs's output, which the server/static tests
// (they serve a fixture client dir) never exercised. Criteria traced: @AC-1.

import { describe, expect, it } from 'vitest';

import { inlineBundle, SCRIPT_TAG } from '../../../scripts/build-web.mjs';

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>${SCRIPT_TAG}</body></html>`;

describe('inlineBundle', () => {
  it('inserts the bundle verbatim even when it contains $ replacement patterns', () => {
    // $&, $', $`, $1 are all special to a String.replace string replacement.
    const bundle = 'const a=$typeof;b.replace(/x/,"$&");c="$\'";d="$`";e=err$0;';
    const html = inlineBundle(TEMPLATE, bundle);
    expect(html).toContain(bundle);
    // The source tag must not be re-injected (that was the $& corruption).
    expect(html).not.toContain(SCRIPT_TAG);
  });

  it('escapes every form the HTML parser treats as a closing script tag', () => {
    const bundle = 'a="</script>";b="</script ";c="</script/";d="</SCRIPT>";';
    const html = inlineBundle(TEMPLATE, bundle);
    const scriptBody = html.slice(
      html.indexOf('<script type="module">') + '<script type="module">'.length,
      html.lastIndexOf('</script>'),
    );
    // Nothing inside the inline script closes it early.
    expect(/<\/script[\s/>]/i.test(scriptBody)).toBe(false);
    // Exactly one real closing tag remains (the one we wrap the bundle in).
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
  });

  it('throws when the template lacks the expected script tag', () => {
    expect(() => inlineBundle('<html></html>', 'x')).toThrow(/missing the expected script tag/);
  });
});
