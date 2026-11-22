"""Walks through every Friends screen against a stand-in server and runs the
same WCAG 2.2 AA checks as a11y_check.py. Run from the project folder:
    python tools/friends_check.py
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import serve
from a11y_check import run_checks, BASE, TEST_IMAGE
from playwright.sync_api import sync_playwright

SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.78.0/+esm'
MOCK = open(os.path.join(HERE, 'mock-supabase.js')).read()
CONFIG = """export const SUPABASE_URL = 'https://mock.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'mock-key';
export const OWNER_NAME = 'Jon';
export const OWNER_EMAIL = 'owner@example.com';
"""
SHOTS = os.path.join(HERE, 'shots')


def main():
    serve.start()
    os.makedirs(SHOTS, exist_ok=True)
    results, errors, steps = {}, [], []

    def check(label, n=30):
        run_checks(pg, label, results, n)
        pg.screenshot(path=os.path.join(SHOTS, f"{len(results):02d}-{label.replace(' ', '-').lower()}.png"), full_page=True)

    def step(name, ok):
        steps.append((name, ok))
        if not ok:
            print('  STEP FAILED:', name)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        ctx.route(SUPABASE_JS, lambda r: r.fulfill(status=200, body=MOCK, headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'}))
        ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, body=CONFIG, headers={'content-type': 'application/javascript'}))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        pg.goto(BASE); pg.wait_for_selector('h1')
        pg.set_input_files('#snap-input', TEST_IMAGE); pg.wait_for_selector('.fb')
        pg.fill('#piece-title', 'Sunny hill'); pg.click('button[type=submit]'); pg.wait_for_selector('.gallery')

        pg.goto(BASE + '#/friends'); pg.wait_for_selector('.empty h2'); time.sleep(0.2)
        step('Friends asks for a grown-up', 'grown-up' in pg.inner_text('.empty h2'))
        check('Friends setup needed')

        pg.click('a[href="#/parent"]'); pg.wait_for_selector('#parent-email')
        pg.click('button[type=submit]'); time.sleep(0.1)
        step('Empty email shows an error', 'Enter an email' in pg.inner_text('#email-error'))
        check('Grown-up sign in')
        pg.fill('#parent-email', 'owner@example.com'); pg.click('button[type=submit]'); pg.wait_for_selector('#parent-code')
        pg.fill('#parent-code', '000000'); pg.click('button[type=submit]'); time.sleep(0.3)
        step('Wrong code shows an error', 'didn’t work' in pg.inner_text('#code-error'))
        check('Enter sign-in code')
        pg.fill('#parent-code', '123456'); pg.click('button[type=submit]'); pg.wait_for_selector('#pin-new')
        pg.fill('#pin-new', '1234'); pg.fill('#pin-again', '9999'); pg.click('button[type=submit]'); time.sleep(0.1)
        step('Mismatched PIN shows an error', 'don’t match' in pg.inner_text('#pin-error'))
        check('Make a PIN')
        pg.fill('#pin-again', '1234'); pg.click('button[type=submit]')
        pg.wait_for_selector('[data-action="c-owner-family"]'); time.sleep(0.2)
        check('Owner without a family')

        pg.click('[data-action="c-owner-family"]'); pg.wait_for_selector('dialog[open] #dialog-field')
        pg.fill('#dialog-field', 'Jon'); pg.keyboard.press('Enter')
        pg.wait_for_selector('#child-name'); pg.wait_for_selector('#friend-families .empty-note, #friend-families .manage-list'); time.sleep(0.3)
        check('Approved family, no kids', 45)

        pg.click('form[data-form="c-add-child"] button[type=submit]'); time.sleep(0.1)
        step('Empty kid name shows an error', 'first name' in pg.inner_text('#child-error'))
        pg.fill('#child-name', 'Sky'); pg.click('text=Sunny yellow'); pg.click('form[data-form="c-add-child"] button[type=submit]')
        pg.wait_for_selector('.manage-row .manage-title'); time.sleep(0.3)
        step('Kid added and set for this device', 'Uses this device' in pg.inner_text('#kids-h + .manage-list'))

        pg.fill('#link-code', 'NOPE99'); pg.click('form[data-form="c-link"] button[type=submit]'); time.sleep(0.3)
        step('Bad friend code shows an error', 'didn’t work' in pg.inner_text('#link-error'))
        pg.fill('#link-code', 'mia123'); pg.click('form[data-form="c-link"] button[type=submit]')
        pg.wait_for_function("() => document.querySelector('#friend-families') && document.querySelector('#friend-families').innerText.includes('Dana')"); time.sleep(0.2)
        step('Families connected', 'Mia' in pg.inner_text('#friend-families'))
        pg.click('[data-action="c-get-link"]'); pg.wait_for_selector('dialog[open]')
        step('Friend code shown', 'ABC234' in pg.inner_text('dialog h2'))
        pg.keyboard.press('Escape'); time.sleep(0.2)
        check('Approved family with a kid and a friend', 50)

        pg.click('a[href="#/owner"]'); pg.wait_for_selector('#review-h'); time.sleep(0.2)
        step('Owner sees Lee waiting', 'Lee' in pg.inner_text('main'))
        check('Owner tools')
        pg.fill('#invite-note', 'The Garcias'); pg.click('form[data-form="c-invite"] button[type=submit]'); pg.wait_for_selector('dialog[open]')
        step('Invite code created', 'Invite code' in pg.inner_text('dialog h2'))
        pg.keyboard.press('Escape'); time.sleep(0.3)
        pg.click('[data-action="c-review"][data-approve="1"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog button[value="ok"]'); time.sleep(0.4)
        step('Lee approved', 'No forms waiting' in pg.inner_text('main'))

        pg.goto(BASE + '#/parent'); pg.wait_for_selector('[data-action="c-lock"]'); pg.click('[data-action="c-lock"]')
        pg.wait_for_selector('.feed'); time.sleep(0.3)
        step('Feed shows Mia’s art', 'Watercolor flower' in pg.inner_text('.feed'))
        check('Friends feed')
        heart = pg.locator('[data-action="c-react"][data-kind="heart"]').first
        heart.click(); time.sleep(0.3)
        step('Like turns on', heart.get_attribute('aria-pressed') == 'true' and heart.inner_text().strip().endswith('2'))

        pg.click('.feed a.react'); pg.wait_for_selector('#comment-text'); time.sleep(0.2)
        pg.fill('#comment-text', 'that is ugly'); pg.press('#comment-text', 'Enter'); time.sleep(0.3)
        step('Unkind comment blocked', 'kind' in pg.inner_text('#nudge').lower())
        check('Comments with a nudge')
        pg.fill('#comment-text', 'I love the purple petals'); pg.press('#comment-text', 'Enter'); time.sleep(0.5)
        step('Kind comment posted', 'purple petals' in pg.inner_text('.comments'))
        pg.click('[data-action="c-quick"] >> nth=1'); time.sleep(0.5)
        step('Quick comment posted', 'So creative' in pg.inner_text('.comments'))
        pg.click('[data-action="c-report-comment"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog button[value="ok"]'); time.sleep(0.5)
        step('Comment reported', pg.locator('.reported').count() == 1)

        pg.goto(BASE + '#/museum'); pg.wait_for_selector('.art-tile'); pg.click('.art-tile'); pg.wait_for_selector('[data-action="share-piece"]')
        pg.click('[data-action="share-piece"]'); pg.wait_for_url('**/#/friends'); pg.wait_for_selector('.feed'); time.sleep(0.4)
        step('Shared art in feed', 'Sunny hill' in pg.inner_text('.feed'))

        pg.goto(BASE + '#/parent'); pg.wait_for_selector('#pin-check')
        pg.fill('#pin-check', '0000'); pg.click('button[type=submit]'); time.sleep(0.2)
        step('Wrong PIN counts down', 'tries left' in pg.inner_text('#pin-error'))
        check('Enter PIN')
        pg.fill('#pin-check', '1234'); pg.click('button[type=submit]'); pg.wait_for_selector('#family-posts .manage-list'); time.sleep(0.3)
        step('Parent sees shared art', 'Sunny hill' in pg.inner_text('#family-posts'))
        pg.click('[data-action="c-delete-post"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog button[value="ok"]'); time.sleep(0.5)
        step('Shared art deleted', 'Nothing shared yet' in pg.inner_text('#family-posts'))

        pg.click('[data-action="c-withdraw"]'); pg.wait_for_selector('dialog[open]'); pg.click('dialog button[value="ok"]')
        pg.wait_for_url('**/#/friends'); pg.wait_for_selector('.empty h2'); time.sleep(0.3)
        step('Family deleted and signed out', 'grown-up' in pg.inner_text('.empty h2'))

        # A second parent joining with an invite code and sending a form
        pg.click('a[href="#/parent"]'); pg.wait_for_selector('#parent-email')
        pg.fill('#parent-email', 'new@example.com'); pg.click('button[type=submit]'); pg.wait_for_selector('#parent-code')
        pg.fill('#parent-code', '123456'); pg.click('button[type=submit]'); pg.wait_for_selector('#pin-new')
        pg.fill('#pin-new', '2468'); pg.fill('#pin-again', '2468'); pg.click('button[type=submit]'); pg.wait_for_selector('#join-code')
        pg.fill('#join-name', 'Ana'); pg.fill('#join-code', 'BADCODE'); pg.click('button[type=submit]'); time.sleep(0.3)
        step('Bad invite shows an error', 'didn’t work' in pg.inner_text('#join-error'))
        check('Join with invite')
        pg.fill('#join-code', 'welcome1'); pg.click('button[type=submit]'); pg.wait_for_selector('#consent-file'); time.sleep(0.2)
        check('Give permission', 40)
        pg.set_input_files('#consent-file', TEST_IMAGE); pg.click('form[data-form="c-consent"] button[type=submit]')
        pg.wait_for_selector('.fb-good'); time.sleep(0.2)
        step('Form received', 'Form received' in pg.inner_text('main'))
        check('Waiting for approval', 40)

        for page_name in ['privacy.html', 'consent-form.html']:
            pg.goto(BASE + page_name); pg.wait_for_selector('h1'); time.sleep(0.3)
            issues = pg.evaluate(open(os.path.join(HERE, 'a11y_check.py')).read().split('CHECK_JS = r"""')[1].split('"""')[0].replace(
                "const h1s = [...main.querySelectorAll('h1')]", "const h1s = [...document.querySelectorAll('h1')]").replace(
                "for (const h of [...main.querySelectorAll(", "for (const h of [...document.querySelectorAll(").replace(
                "if (!document.querySelector('.tab[aria-current=\"page\"]') && document.body.dataset.tabs === 'on')", "if (false)").replace(
                "if (!toast || toast.getAttribute('role') !== 'status')", "if (false)"))
            results[page_name] = {'issues': issues, 'tab_stops': 0}
            step(f'{page_name} filled in owner name', 'Jon' in pg.inner_text('body'))
        browser.close()

    json.dump(results, open(os.path.join(HERE, 'friends-results.json'), 'w'), indent=2)
    fails = [(k, i) for k, v in results.items() for i in v['issues'] if not i['rule'].endswith('advisory')]
    failed_steps = [s for s, ok in steps if not ok]
    print(f'Friends states checked: {len(results)}  Accessibility failures: {len(fails)}  Steps: {len(steps) - len(failed_steps)}/{len(steps)} passed  JS errors: {len(errors)}')
    for k, i in fails:
        print(f'  [{k}] {i["sc"]} {i["rule"]}: {i["el"]} — {i["msg"]}')
    for e in errors:
        print('  JS ERROR:', e)
    return len(fails) + len(failed_steps) + len(errors)


if __name__ == '__main__':
    sys.exit(1 if main() else 0)
