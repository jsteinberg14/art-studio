"""Automated WCAG 2.2 AA checks for My Art Studio, run in headless Chromium.

Run from the project folder:
    pip install playwright && python -m playwright install chromium
    python tools/a11y_check.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8765/'
HERE = os.path.dirname(os.path.abspath(__file__))
TEST_IMAGE = os.path.join(HERE, 'test-art.jpg')
RESULTS = os.path.join(HERE, 'a11y-results.json')
CHECK_JS = r"""
() => {
  const issues = [];
  const add = (rule, sc, el, msg) => issues.push({ rule, sc, el: el ? describe(el) : '', msg });
  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t ? `${s} "${t}"` : s;
  }
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  }

  // 3.1.1 Language of page
  if (!document.documentElement.lang) add('html-lang', '3.1.1', null, 'Page has no lang attribute');
  // 1.4.4 / 1.4.10 zoom not blocked
  const vp = document.querySelector('meta[name=viewport]');
  if (vp && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp.content)) add('meta-viewport', '1.4.4', vp, 'Zoom is disabled');
  // 2.4.2 page title
  if (!document.title.trim()) add('document-title', '2.4.2', null, 'Page has no title');

  const scope = document.querySelector('dialog[open]') || document.body;
  // 1.3.1 headings
  const main = document.getElementById('main');
  if (!document.querySelector('dialog[open]')) {
    const h1s = [...main.querySelectorAll('h1')].filter(visible);
    if (h1s.length !== 1) add('page-has-one-h1', '1.3.1', null, `Screen has ${h1s.length} h1 headings`);
    let last = 0;
    for (const h of [...main.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible)) {
      const lvl = Number(h.tagName[1]);
      if (last && lvl > last + 1) add('heading-order', '1.3.1', h, `Heading jumps from h${last} to h${lvl}`);
      last = lvl;
    }
  }
  // 4.1.1-style duplicate ids
  const ids = {};
  document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => add('duplicate-id', '4.1.2', null, `Duplicate id "${id}"`));

  // Accessible names
  const textOf = (el) => {
    let s = '';
    el.childNodes.forEach((c) => {
      if (c.nodeType === 3) s += c.textContent;
      else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true') {
        if (c.tagName === 'IMG') s += c.getAttribute('alt') || '';
        else s += ' ' + textOf(c);
      }
    });
    return s.replace(/\s+/g, ' ').trim();
  };
  const nameOf = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return lb.split(/\s+/).map((id) => { const t = document.getElementById(id); return t ? textOf(t) : ''; }).join(' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return textOf(l); }
      const wrap = el.closest('label'); if (wrap) return textOf(wrap);
      return el.getAttribute('title') || '';
    }
    return textOf(el) || el.getAttribute('title') || '';
  };
  const interactive = [...scope.querySelectorAll('a[href], button, input, select, textarea, [role="switch"], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !(el.closest('[aria-hidden="true"]') && el.tabIndex < 0));
  for (const el of interactive) {
    const isHiddenInput = el.tagName === 'INPUT' && getComputedStyle(el).opacity === '0';
    if (!visible(el) && !isHiddenInput) continue;
    const name = nameOf(el);
    if (!name) add('control-name', '4.1.2', el, 'Control has no accessible name');
    // 2.5.3 label in name
    const vis = textOf(el).replace(/\s+/g, ' ').trim().toLowerCase();
    const al = (el.getAttribute('aria-label') || '').toLowerCase();
    if (al && vis && /[a-z]/.test(vis) && !al.includes(vis)) add('label-in-name', '2.5.3', el, `Visible text "${vis}" is not in the accessible name "${al}"`);
    // 2.5.8 target size (minimum 24 x 24)
    if (!isHiddenInput && el.tagName !== 'INPUT') {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) add('target-size', '2.5.8', el, `Target is ${Math.round(r.width)}x${Math.round(r.height)}px (minimum 24x24)`);
      else if (r.width < 44 || r.height < 44) add('target-size-advisory', 'advisory (2.5.5 AAA / Apple 44pt)', el, `Target is ${Math.round(r.width)}x${Math.round(r.height)}px`);
    }
  }
  // 1.1.1 images
  scope.querySelectorAll('img').forEach((img) => { if (!img.hasAttribute('alt')) add('image-alt', '1.1.1', img, 'Image has no alt attribute'); });
  scope.querySelectorAll('[role="img"]').forEach((el) => { if (visible(el) && !nameOf(el)) add('role-img-name', '1.1.1', el, 'role=img has no name'); });
  // 1.3.1 / 3.3.2 form labels
  scope.querySelectorAll('input:not([type=hidden]), textarea, select').forEach((el) => {
    if (el.id === 'snap-input') return;
    if (!nameOf(el)) add('form-label', '3.3.2', el, 'Form field has no label');
  });

  // 1.4.3 text contrast
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (seen.has(el) || !visible(el) || el.closest('.sr-only') || el.closest('svg') || el.closest('noscript') || el.closest('script,style')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const fgB = fg.a < 1 ? blend(fg, bg) : fg;
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const r = ratio(fgB, bg);
    if (r < need) add('color-contrast', '1.4.3', el, `Contrast ${r.toFixed(2)}:1 (needs ${need}:1)`);
  }
  // Placeholder contrast (best practice)
  scope.querySelectorAll('input[placeholder]').forEach((el) => {
    const ph = parse(getComputedStyle(el, '::placeholder').color);
    if (ph && ratio(ph, bgOf(el)) < 4.5) add('placeholder-contrast', '1.4.3', el, 'Placeholder text contrast is below 4.5:1');
  });
  // 1.4.11 non-text contrast for color choices and field borders
  scope.querySelectorAll('.swatch-dot, .shade').forEach((el) => {
    if (!visible(el)) return;
    const border = parse(getComputedStyle(el).borderTopColor);
    const around = bgOf(el.parentElement.parentElement);
    const fill = parse(getComputedStyle(el).backgroundColor);
    const best = Math.max(ratio(border, around), ratio(fill, around));
    if (best < 3) add('non-text-contrast', '1.4.11', el.closest('button') || el, `Color choice edge is ${best.toFixed(2)}:1 against the page (needs 3:1)`);
  });
  scope.querySelectorAll('.input, .composer, .switch, .arrow-btn').forEach((el) => {
    if (!visible(el)) return;
    const border = parse(getComputedStyle(el).borderTopColor);
    const r = ratio(border, bgOf(el.parentElement));
    if (r < 3) add('non-text-contrast', '1.4.11', el, `Border is ${r.toFixed(2)}:1 against its background (needs 3:1)`);
  });
  // 1.4.1 selected states shown without color alone: check state attributes exist
  document.querySelectorAll('.tool[data-tool], .swatch, .shade, .size-btn, .strength-btn, .fav-btn, .react[data-action]').forEach((el) => {
    if (!el.hasAttribute('aria-pressed')) add('state-exposed', '4.1.2', el, 'Toggle does not expose aria-pressed');
  });
  if (!document.querySelector('.tab[aria-current="page"]') && document.body.dataset.tabs === 'on') add('current-tab', '4.1.2', null, 'No tab is marked as the current page');
  // 4.1.3 status messages
  const toast = document.getElementById('toast');
  if (!toast || toast.getAttribute('role') !== 'status') add('status-messages', '4.1.3', toast, 'Toast is not a status region');
  // 1.4.10 reflow
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) add('reflow', '1.4.10', null, `Page scrolls sideways (${document.documentElement.scrollWidth}px wide)`);
  return issues;
}
"""

FOCUS_JS = r"""
() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { name: 'body', ok: true };
  const shown = (n) => { if (!n) return false; const cs = getComputedStyle(n); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none' && n !== el.closest('.swatch') ); };
  const ok = shown(el) || shown(el.parentElement) || shown(el.closest('label')) || shown(el.closest('.composer'));
  const t = (el.getAttribute('aria-label') || el.textContent || (el.name ? el.name + '=' + el.value : '') || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  return { name: `${el.tagName.toLowerCase()} "${t}"`, ok, key: el.dataset ? (el.dataset.fk || el.dataset.tool || el.dataset.action || el.id || t) : t };
}
"""


def run_checks(pg, label, results, tab_steps=45):
    issues = pg.evaluate(CHECK_JS)
    # 2.4.7 focus visible and 2.1.1 keyboard
    pg.evaluate("() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); }")
    seen = []
    for _ in range(tab_steps):
        pg.keyboard.press('Tab')
        info = pg.evaluate(FOCUS_JS)
        if info['name'] == 'body':
            continue
        if seen and info['name'] == seen[0]:
            break
        seen.append(info['name'])
        if not info['ok']:
            issues.append({'rule': 'focus-visible', 'sc': '2.4.7', 'el': info['name'], 'msg': 'No visible focus indicator'})
    results[label] = {'issues': issues, 'tab_stops': len(seen)}


def main():
    srv = serve.start()
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('h1')
        run_checks(pg, 'Home (empty)', results)
        pg.goto(BASE + '#/museum'); pg.wait_for_selector('h1'); time.sleep(0.2)
        run_checks(pg, 'Museum (empty)', results)
        pg.goto(BASE + '#/ideas'); pg.wait_for_selector('.idea'); run_checks(pg, 'Ideas (starter)', results)
        pg.goto(BASE + '#/snap'); pg.wait_for_selector('.snap-card'); run_checks(pg, 'Snap page (empty)', results)
        pg.goto(BASE + '#/canvas'); pg.wait_for_selector('#stage canvas'); time.sleep(0.3)
        pg.click('[data-tool="blend"]'); time.sleep(0.1)
        run_checks(pg, 'Blank canvas (blend tool and strength)', results, 30)
        pg.click('[data-tool="blend"]'); time.sleep(0.1)  # second tap opens the blend sizes
        run_checks(pg, 'Blank canvas (blend sizes open)', results, 30)
        pg.goto(BASE + '#/home'); pg.wait_for_selector('.link-tile')
        pg.set_input_files('#snap-input', TEST_IMAGE); pg.wait_for_selector('.fb')
        run_checks(pg, 'Review photo', results)
        pg.click('button[type=submit]'); pg.wait_for_selector('.gallery'); time.sleep(0.2)
        run_checks(pg, 'Museum', results)
        pg.goto(BASE + '#/snap'); pg.wait_for_selector('.thumb-row'); time.sleep(0.2); run_checks(pg, 'Snap page', results)
        pg.click('.thumb-link'); pg.wait_for_selector('.piece-title'); time.sleep(0.2); run_checks(pg, 'Piece', results)
        pg.click('[data-action="toggle-favorite"]'); time.sleep(0.2)
        run_checks(pg, 'Piece (favorited)', results)
        pg.goto(BASE + '#/home'); pg.wait_for_selector('.fav-row'); time.sleep(0.2); run_checks(pg, 'Home (with favorites)', results)
        pg.goto(BASE + '#/museum'); pg.wait_for_selector('.fav-badge'); time.sleep(0.2); run_checks(pg, 'Museum (favorite heart)', results)
        pg.click('.art-tile'); pg.wait_for_selector('.piece-title'); time.sleep(0.2)
        pg.click('[data-action="draw-piece"]'); pg.wait_for_selector('#stage canvas'); time.sleep(0.3)
        run_checks(pg, 'Canvas (rainbow)', results, 30)
        pg.click('[data-tool="pen"]'); time.sleep(0.1)  # second tap on selected tool opens sizes
        run_checks(pg, 'Canvas (sizes open)', results, 30)
        pg.click('#palette-arrow'); time.sleep(0.3)
        run_checks(pg, 'Canvas (neutral)', results, 30)
        pg.click('[data-action="pick-color"][data-i="0"]'); time.sleep(0.1)
        run_checks(pg, 'Canvas (white shades)', results, 30)
        box = pg.locator('.stage-ink').bounding_box()
        pg.mouse.move(box['x'] + 30, box['y'] + 30); pg.mouse.down(); pg.mouse.move(box['x'] + 200, box['y'] + 120); pg.mouse.up()
        pg.click('[data-action="save-drawing"]'); pg.wait_for_selector('dialog[open]')
        run_checks(pg, 'Save dialog', results, 8)
        focus_in = pg.evaluate("() => !!document.activeElement.closest('dialog')")
        if not focus_in:
            results['Save dialog']['issues'].append({'rule': 'dialog-focus', 'sc': '2.4.3', 'el': 'dialog', 'msg': 'Focus did not move into the dialog'})
        pg.keyboard.press('Escape'); time.sleep(0.2)
        closed = pg.evaluate("() => !document.querySelector('dialog[open]')")
        back = pg.evaluate("() => document.activeElement && document.activeElement.dataset.action")
        if not closed:
            results['Save dialog']['issues'].append({'rule': 'dialog-escape', 'sc': '2.1.2', 'el': 'dialog', 'msg': 'Escape did not close the dialog'})
        if back != 'save-drawing':
            results['Save dialog']['issues'].append({'rule': 'dialog-return-focus', 'sc': '2.4.3', 'el': 'dialog', 'msg': f'Focus returned to {back} instead of the Save button'})
        pg.click('[data-action="save-drawing"]'); pg.wait_for_selector('dialog[open]'); pg.keyboard.press('Enter')
        pg.wait_for_selector('.piece-title'); time.sleep(0.2)
        pg.click('[data-action="share-piece"]'); pg.wait_for_selector('.feed'); time.sleep(0.2)
        run_checks(pg, 'Friends', results, 30)
        pg.goto(BASE + '#/post/sample-1'); pg.wait_for_selector('#comment-text')
        pg.fill('#comment-text', 'you are dumb'); pg.press('#comment-text', 'Enter'); time.sleep(0.2)
        run_checks(pg, 'Comments (kindness nudge)', results, 30)
        pg.goto(BASE + '#/friends'); pg.wait_for_selector('.feed')
        pg.click('.feed a.react >> nth=0'); pg.wait_for_selector('.switch'); time.sleep(0.2)
        run_checks(pg, 'Comments (own post)', results, 30)
        pg.goto(BASE + '#/settings'); pg.wait_for_selector('.choice'); run_checks(pg, 'Settings', results, 20)
        pg.check('input[name="size"][value="big"]'); time.sleep(0.2)
        run_checks(pg, 'Settings (bigger canvas option on)', results, 20)
        pg.goto(BASE + '#/canvas'); pg.wait_for_selector('#stage canvas'); time.sleep(0.3)
        pg.click('[data-tool="blend"]'); time.sleep(0.1)
        run_checks(pg, 'Canvas (bigger text and colors, blend)', results, 30)
        pg.click('#palette-arrow'); time.sleep(0.3)
        run_checks(pg, 'Canvas (bigger, neutral colors)', results, 30)
        pg.goto(BASE + '#/ideas'); pg.wait_for_selector('.idea'); run_checks(pg, 'Ideas', results)
        # An idea opens a completely blank canvas, with the Blend tool available
        pg.goto(BASE + '#/ideas'); pg.wait_for_selector('.idea'); pg.click('.idea-go >> nth=0'); pg.wait_for_selector('#stage canvas'); time.sleep(0.3)
        run_checks(pg, 'Canvas (from an idea)', results, 30)
        tools_here = pg.eval_on_selector_all('.tool[data-tool]', 'els => els.map(e => e.dataset.tool)')
        label = pg.get_attribute('.stage-ink', 'aria-label') or ''
        if 'blend' not in tools_here or not label.startswith('Blank drawing area'):
            results['Canvas (from an idea)']['issues'].append({'rule': 'idea-blank-canvas', 'sc': 'request', 'el': '#stage', 'msg': f'Idea canvas is not blank (tools: {tools_here}, label: {label})'})
        # Black and white style: screens stay readable and the color swatches keep their colors
        pg.goto(BASE + '#/settings'); pg.wait_for_selector('.choice')
        pg.check('input[name="size"][value="normal"]')
        pg.check('input[name="theme"][value="bw"]'); time.sleep(0.2)
        run_checks(pg, 'Settings (black and white)', results, 20)
        for route, sel, label in [('#/home', '.link-tile', 'Home (black and white)'), ('#/ideas', '.idea', 'Ideas (black and white)'), ('#/friends', '.feed', 'Friends (black and white)')]:
            pg.goto(BASE + route); pg.wait_for_selector(sel); time.sleep(0.2); run_checks(pg, label, results, 30)
        pg.goto(BASE + '#/canvas'); pg.wait_for_selector('#stage canvas'); time.sleep(0.3)
        pg.click('[data-tool="blend"]'); time.sleep(0.1)
        run_checks(pg, 'Canvas (black and white style)', results, 30)
        dots = pg.evaluate("() => [...document.querySelectorAll('.swatch')].map((b) => getComputedStyle(b.querySelector('.swatch-dot')).backgroundColor)")
        want = ['rgb(242, 139, 130)', 'rgb(248, 178, 106)', 'rgb(251, 214, 106)', 'rgb(143, 209, 158)', 'rgb(133, 183, 235)', 'rgb(179, 157, 219)', 'rgb(244, 166, 198)']
        if dots != want:
            results['Canvas (black and white style)']['issues'].append({'rule': 'swatch-colors', 'sc': 'request', 'el': '.swatch', 'msg': f'Swatch colors changed in black and white style: {dots}'})
        pg.goto(BASE + '#/settings'); pg.wait_for_selector('.choice'); pg.check('input[name="theme"][value="sky"]'); time.sleep(0.1)

        # 1.4.10 reflow at 320 CSS px and 1.4.4 text at 200%
        small = browser.new_context(viewport={'width': 320, 'height': 640})
        sp = small.new_page()
        for route in ['#/home', '#/snap', '#/museum', '#/ideas', '#/friends', '#/post/sample-1', '#/settings', '#/canvas']:
            sp.goto(BASE + route); sp.wait_for_selector('h1'); time.sleep(0.3)
            w = sp.evaluate("() => document.documentElement.scrollWidth")
            key = f'Reflow 320px {route}'
            results[key] = {'issues': [] if w <= 321 else [{'rule': 'reflow', 'sc': '1.4.10', 'el': route, 'msg': f'Scrolls sideways at 320px ({w}px)'}], 'tab_stops': 0}
            sp.evaluate("() => { document.documentElement.style.fontSize = '200%'; }"); time.sleep(0.2)
            w2 = sp.evaluate("() => document.documentElement.scrollWidth")
            key2 = f'Text 200% at 320px {route}'
            results[key2] = {'issues': [] if w2 <= 321 else [{'rule': 'resize-text', 'sc': '1.4.4', 'el': route, 'msg': f'Content overflows sideways with 200% text ({w2}px)'}], 'tab_stops': 0}
        # Blend tool and strength row at 320 px, also with 200% text
        sp.goto(BASE + '#/canvas'); sp.reload(); sp.wait_for_selector('#stage canvas'); time.sleep(0.3)  # reload clears the 200% text from the loop above
        sp.click('[data-tool="blend"]'); sp.click('[data-tool="blend"]'); time.sleep(0.2)
        sp.evaluate("() => { document.documentElement.dataset.size = 'big'; }"); time.sleep(0.2)
        wb = sp.evaluate("() => document.documentElement.scrollWidth")
        results['Reflow 320px blend tool'] = {'issues': [] if wb <= 321 else [{'rule': 'reflow', 'sc': '1.4.10', 'el': 'blend', 'msg': f'Scrolls sideways at 320px ({wb}px)'}], 'tab_stops': 0}
        sp.evaluate("() => { document.documentElement.style.fontSize = '200%'; }"); time.sleep(0.2)
        wb2 = sp.evaluate("() => document.documentElement.scrollWidth")
        results['Text 200% at 320px blend tool'] = {'issues': [] if wb2 <= 321 else [{'rule': 'resize-text', 'sc': '1.4.4', 'el': 'blend', 'msg': f'Content overflows sideways with 200% text ({wb2}px)'}], 'tab_stops': 0}
        # 1.4.12 text spacing
        sp.goto(BASE + '#/home'); sp.wait_for_selector('h1')
        sp.add_style_tag(content='* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }')
        time.sleep(0.2)
        w3 = sp.evaluate("() => document.documentElement.scrollWidth")
        results['Text spacing'] = {'issues': [] if w3 <= 321 else [{'rule': 'text-spacing', 'sc': '1.4.12', 'el': 'home', 'msg': f'Overflow with extra text spacing ({w3}px)'}], 'tab_stops': 0}
        # 2.3.3 / reduced motion respected
        rm = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        rp = rm.new_page(); rp.goto(BASE + '#/canvas'); rp.wait_for_selector('#palette-arrow'); time.sleep(0.3)
        rp.click('#palette-arrow')
        dur = rp.evaluate("() => getComputedStyle(document.getElementById('swatches')).animationDuration")
        results['Reduced motion'] = {'issues': [] if dur in ('1e-05s', '0.00001s', '0s') else [{'rule': 'reduced-motion', 'sc': '2.3.3', 'el': '#swatches', 'msg': f'Animation runs with reduced motion on ({dur})'}], 'tab_stops': 0}
        browser.close()
    results['_errors'] = errors
    json.dump(results, open(RESULTS, 'w'), indent=2)
    fails = {k: [i for i in v['issues'] if not i['rule'].endswith('advisory')] for k, v in results.items() if k != '_errors'}
    total = sum(len(v) for v in fails.values())
    adv = sum(len([i for i in v['issues'] if i['rule'].endswith('advisory')]) for k, v in results.items() if k != '_errors')
    print(f'States checked: {len(fails)}  Failures: {total}  Advisories: {adv}  JS errors: {len(errors)}')
    for k, v in fails.items():
        for i in v:
            print(f'  [{k}] {i["sc"]} {i["rule"]}: {i["el"]} — {i["msg"]}')
    for e in errors: print('  JS ERROR:', e)
    return total


if __name__ == '__main__':
    sys.exit(1 if main() else 0)
