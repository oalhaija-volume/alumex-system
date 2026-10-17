import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' }); // Route mocks must also intercept document navigation.

const fatma = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fatma', role: 'Indoor Sales', branch: 'Karkh' };
const ehab = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Ehab', role: 'Outdoor Sales' };

for (const actor of [fatma, ehab]) {
  for (const ready of [true, false]) {
    for (const online of [true, false]) {
      test(`${actor.name}: ${ready ? 'ready' : 'not ready'}, ${online ? 'online' : 'offline'} registration follows role responsibilities`, async ({ page }) => {
        const state = { actor, outdoorSales: [{ id: ehab.id, name: ehab.name }], indoorSales: [{ id: fatma.id, name: fatma.name }], projects: [], openings: [], queue: [], syncedAt: null };
        let registration: { userId: string; payload: { project: { structureReadiness: string; assignedOutdoorSalesId: string | null } } } | undefined;
        await page.route('**/api/offline*', async route => {
          if (route.request().method() !== 'POST') return route.fulfill({ json: state });
          const change = route.request().postDataJSON();
          registration = change;
          // Intercept the write: no client or project is created in Supabase.
          return route.fulfill({ json: { project: { id: change.projectId, project_number: 'PRJ-ROUTING-TEST', updated_at: new Date().toISOString() } } });
        });
        await page.goto('/offline?path=/intake');
        await page.evaluate(async state => {
          localStorage.setItem('alumex_locale', 'en');
          localStorage.setItem('alumex-field-active', state.actor.id);
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('alumex-field-v1', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('accounts');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const transaction = db.transaction('accounts', 'readwrite');
              transaction.objectStore('accounts').put(state, state.actor.id);
              transaction.oncomplete = () => { db.close(); resolve(); };
              transaction.onerror = () => reject(transaction.error);
            };
          });
          window.dispatchEvent(new Event('field-change'));
        }, state);
        await expect(page.getByPlaceholder('Enter full name')).toBeVisible();
        await page.getByPlaceholder('Enter full name').fill('Routing test client');
        await page.getByPlaceholder('07xx xxx xxxx').fill('07700000000');
        await page.getByRole('button', { name: 'Project location map', exact: true }).click({ position: { x: 80, y: 80 } });
        if (!ready) {
          await page.getByRole('radio', { name: /Not ready yet/ }).check();
          if(actor.role==='Outdoor Sales')await page.getByLabel('Reason not ready for measurement').fill('Plastering unfinished');
        }
        if (actor.role === 'Indoor Sales') {
          await expect(page.locator('#outdoor-assignee')).toHaveValue(ehab.id);
          await expect(page.getByRole('button', { name: 'Continue to measurements', exact: false })).toHaveCount(0);
        }
        if (actor.role === 'Outdoor Sales') await expect(page.locator('#outdoor-assignee')).toHaveCount(0);
        if (!online) {
          await page.evaluate(() => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
            window.dispatchEvent(new Event('offline'));
          });
        }
        // Observe destinations without loading protected routes or creating records.
        await page.route('**/initial-measurements/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Measurement destination</h1>' }));
        await page.route(url => url.pathname === '/mini-crm', route => route.fulfill({ contentType: 'text/html', body: '<h1>Follow-up destination</h1>' }));
        await page.route('**/offline?project=*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Offline measurement destination</h1>' }));
        await page.route('**/offline?path=/mini-crm', route => route.fulfill({ contentType: 'text/html', body: '<h1>Offline follow-up destination</h1>' }));
        await page.getByRole('button', { name: actor.role === 'Outdoor Sales' && ready ? /Continue to measurements/ : /Save registration/ }).click();

        if ((actor.role === 'Indoor Sales' && ready) || (actor.role === 'Outdoor Sales' && !ready)) {
          await expect(page.getByRole('heading', { name: 'Registration saved' })).toBeVisible();
          await expect(page.getByText(ready ? 'The project is assigned to Ehab for initial measurements.' : 'The project is in the CRM queue. Indoor Sales will follow up until the site is ready for measurements.')).toBeVisible();
          await expect(page).toHaveURL(/\/offline\?path=\/intake$/);
          if (!online) await expect(page.getByText('Saved on device · Pending sync', { exact: true })).toBeVisible();
        } else {
          await expect(page).toHaveURL(ready ? online ? /\/initial-measurements\/[\da-f-]+$/ : /\/offline\?project=[\da-f-]+$/ : online ? /\/mini-crm$/ : /\/offline\?path=\/mini-crm$/);
        }
        if (online) {
          expect(registration?.userId).toBe(actor.id);
          expect(registration?.payload.project.structureReadiness).toBe(ready ? 'ready' : 'not_ready');
          expect(registration?.payload.project.assignedOutdoorSalesId).toBe(actor.role === 'Indoor Sales' ? ehab.id : null);
        }
      });
    }
  }
}

for (const role of ['Indoor Sales', 'Sales Director', 'Outdoor Sales', 'Admin', 'CEO', 'Company Owner']) {
  test(`${role}: offline CRM and history enforce the same access policy`, async ({ page, isMobile }) => {
    const actor = { ...fatma, role };
    const state = {
      actor, indoorSales: [{ id: fatma.id, name: fatma.name }], outdoorSales: [{ id: ehab.id, name: ehab.name }],
      projects: ['new_lead', 'quotation_in_progress', 'contract_generated', 'contract_signed'].map((sales_status, index) => ({
        id: `11111111-1111-4111-8111-11111111111${index}`, project_name: `CRM sample ${index}`, project_number: `PRJ-${index}`,
        structure_readiness: index ? 'ready' : 'not_ready', sales_status, address: 'Baghdad', phone: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: ehab.id,
        registeredBy: 'Ehab', follow_up_owner_id: null, next_follow_up_at: null, project_notes: null,
      })),
      openings: [], queue: [], syncedAt: null,
    };
    await page.route('**/api/offline*', route => route.fulfill({ json: state }));
    await page.route('**/api/workspace', route => route.fulfill({ json: state }));
    await page.goto('/offline?path=/mini-crm');
    await page.evaluate(async state => {
      localStorage.setItem('alumex-field-active', state.actor.id);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('accounts', 'readwrite');
          transaction.objectStore('accounts').put(state, state.actor.id);
          transaction.oncomplete = () => { db.close(); resolve(); };
        };
      });
      window.dispatchEvent(new Event('field-change'));
    }, state);
    if (role !== 'Outdoor Sales') {
      await expect(page.getByRole('heading', { name: 'Mini CRM', exact: true })).toBeVisible();
      await expect(page.locator('article')).toHaveCount(3);
      for (const stage of ['site', 'quotation-response', 'contract-signature']) {
        await page.getByLabel('Project stage', { exact: true }).selectOption(stage);
        await expect(page.locator('article')).toHaveCount(1);
      }
    } else {
      if(isMobile)await expect(page.getByRole('heading',{name:'Measurement assignments',exact:true})).toBeVisible();
      else await expect(page.getByRole('alert').filter({ hasText: 'CRM access' })).toHaveText('CRM access is limited to Indoor Sales and company leadership.');
      await expect(page.getByRole('button', { name: 'Follow-ups', exact: true })).toHaveCount(0);
      await expect(page.locator('article')).toHaveCount(0);
      await page.goto('/offline?path=/projects/11111111-1111-4111-8111-111111111110/follow-ups');
      if(isMobile)await expect(page.getByRole('heading',{name:'Measurement assignments',exact:true})).toBeVisible();
      else await expect(page.getByRole('alert').filter({ hasText: 'CRM access' })).toHaveText('CRM access is limited to Indoor Sales and company leadership.');
      await expect(page.getByRole('heading', { name: 'Project follow-ups', exact: true })).toHaveCount(0);
    }
  });
}

test('Outdoor Sales receives new assignment alerts; read alerts stay dismissed and finished tasks leave the dashboard', async ({ page }) => {
  const state = {
    actor: ehab, indoorSales: [fatma], outdoorSales: [ehab], openings: [], queue: [], syncedAt: null,
    projects: [{
      id: '11111111-1111-4111-8111-111111111111', project_name: 'Assigned residence', project_number: 'PRJ-ALERT-1',
      structure_readiness: 'ready', sales_status: 'new_lead', status: 'Draft', address: 'Baghdad', phone: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: fatma.id,
      registeredBy: 'Fatma', assigned_outdoor_sales_id: ehab.id, assignedOutdoorSales: 'Ehab',
      follow_up_owner_id: fatma.id, next_follow_up_at: null, project_notes: null,
    }],
  };
  await page.route('**/api/offline*', route => route.fulfill({ json: state }));
  await page.route('**/api/workspace', route => route.fulfill({ json: state }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/offline?path=/dashboard');
  async function updateDevice() {
    await page.evaluate(async state => {
      localStorage.setItem('alumex-field-active', state.actor.id);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('alumex-field-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('accounts', 'readwrite');
          transaction.objectStore('accounts').put(state, state.actor.id);
          transaction.oncomplete = () => { db.close(); resolve(); };
        };
      });
      window.dispatchEvent(new Event('field-change'));
    }, state);
  }
  await updateDevice();
  const alerts = page.getByRole('region', { name: 'New measurement assignments', exact: true });
  const tasks = page.getByRole('region', { name: 'Measurement tasks', exact: true });
  await expect(alerts.getByText('Assigned residence', { exact: true })).toBeVisible();
  await expect(tasks.getByRole('link', { name: 'Record measurements' })).toHaveAttribute('href', '/initial-measurements/11111111-1111-4111-8111-111111111111');
  await alerts.getByRole('button', { name: 'Mark as read' }).click();
  await expect(alerts).toHaveCount(0);
  await expect(tasks.getByText('Assigned residence', { exact: true })).toBeVisible();
  await page.reload();
  await expect(tasks.getByText('Assigned residence', { exact: true })).toBeVisible();
  await expect(alerts).toHaveCount(0);
  state.projects.push({ ...state.projects[0], id: '22222222-2222-4222-8222-222222222222', project_name: 'New office assignment', project_number: 'PRJ-ALERT-2' });
  await updateDevice();
  await expect(alerts.getByText('New office assignment', { exact: true })).toBeVisible();
  await expect(alerts.getByText('Assigned residence', { exact: true })).toHaveCount(0);
  await expect(tasks.getByText('New office assignment', { exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/mini-crm-review-20261015/outdoor-dashboard-alerts.png', fullPage: true });
  state.projects[1].sales_status = 'ready_for_quotation';
  await updateDevice();
  await expect(alerts).toHaveCount(0);
  await expect(tasks.getByText('New office assignment', { exact: true })).toHaveCount(0);
  await expect(tasks.getByText('Assigned residence', { exact: true })).toBeVisible();
  Object.assign(state.projects[0], {measurement_assignment_id:'new-assignment-cycle'});
  await updateDevice();
  await expect(alerts.getByText('Assigned residence', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for(const ready of [false,true])for(const online of [false,true])test(`CRM ${ready?'ready':'waiting'} site assigns measurements to a selected employee ${online?'online':'offline'}`,async({page})=>{
 const second={id:'33333333-3333-4333-8333-333333333333',name:'Second outdoor employee'};
 const project={id:'11111111-1111-4111-8111-111111111111',project_name:'CRM assignment sample',project_number:'PRJ-ASSIGN',structure_readiness:ready?'ready':'not_ready',sales_status:'new_lead',status:'Draft',address:'Baghdad',phone:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:fatma.id,registeredBy:'Fatma',assigned_outdoor_sales_id:ehab.id,assignedOutdoorSales:'Ehab',next_follow_up_at:null,project_notes:null};
 const state={actor:fatma,indoorSales:[fatma],outdoorSales:[ehab,second],projects:[project],openings:[],queue:[],syncedAt:null};
 const writes: Record<string,unknown>[]=[];
 await page.route('**/api/workspace',route=>route.fulfill({json:state}));
 await page.route('**/api/offline*',async route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();writes.push(body);
   expect(body.payload.assignedOutdoorSalesId).toBe(second.id);
   Object.assign(project,{assigned_outdoor_sales_id:second.id,assignedOutdoorSales:second.name,measurement_assignment_id:body.id,structure_readiness:'ready',updated_at:new Date().toISOString()});
   return route.fulfill({json:{project}});
  }
  return route.fulfill({json:state});
 });
 await page.goto('/offline?path=/mini-crm');
 await page.evaluate(async state=>{
  localStorage.setItem('alumex-field-active',state.actor.id);
  await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('alumex-field-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('accounts');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('accounts','readwrite');tx.objectStore('accounts').put(state,state.actor.id);tx.oncomplete=()=>{db.close();resolve();};};});
  window.dispatchEvent(new Event('field-change'));
 },state);
 const row=page.locator('article').filter({hasText:'CRM assignment sample'});
 await row.getByRole('button',{name:'Assign measurements',exact:true}).click();
 const form=row.getByRole('form',{name:'Assign measurements',exact:true});
 await form.getByRole('combobox',{name:'Measurements by',exact:true}).selectOption(second.id);
 if(!online)await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});
 await form.getByRole('button',{name:ready?'Save measurement assignment':'Assign & mark site ready',exact:true}).click();
 await expect(row.getByText('Measurements by: Second outdoor employee',{exact:true})).toBeVisible();
 await expect(row.getByText('Initial measurements',{exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/offline\?path=\/mini-crm$/);
 if(online){await expect.poll(()=>writes.length).toBe(1);expect(writes[0].action).toBe(ready?'assign-measurements':'ready');}
 else{
  expect(writes).toHaveLength(0);
  const saved=await page.evaluate(async()=>new Promise<{queue:{action:string;payload:{assignedOutdoorSalesId:string}}[]}>(resolve=>{const request=indexedDB.open('alumex-field-v1',1);request.onsuccess=()=>{const db=request.result;const get=db.transaction('accounts').objectStore('accounts').get(localStorage.getItem('alumex-field-active')!);get.onsuccess=()=>{resolve(get.result);db.close();};};}));
  expect(saved.queue.at(-1)?.payload.assignedOutdoorSalesId).toBe(second.id);
 }
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 if(online&&ready)await page.screenshot({path:'artifacts/mini-crm-review-20261015/crm-assign-measurements.png',fullPage:true});
});

test.describe('Outdoor Sales phone workspace', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', isMobile: true });
  for (const requestedPath of ['/dashboard', '/projects', '/quotation/11111111-1111-4111-8111-111111111110']) {
    test(`phone shows only assignments when opening ${requestedPath}`, async ({ page }) => {
      const projects = ['new_lead', 'ready_for_quotation', 'new_lead', 'new_lead'].map((sales_status, index) => ({
        id: `11111111-1111-4111-8111-11111111111${index}`, project_name: `Phone sample ${index}`, project_number: `PRJ-PHONE-${index}`,
        sales_status, structure_readiness: index === 2 ? 'not_ready' : 'ready', address: 'Baghdad', phone: '07700000000',
        created_by: fatma.id, assigned_outdoor_sales_id: index === 3 ? fatma.id : ehab.id,
        registeredBy: fatma.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        next_follow_up_at: null, project_notes: null,
      }));
      const state = { actor: ehab, projects, outdoorSales: [ehab], indoorSales: [fatma], openings: [], queue: [], syncedAt: null };
      await page.route('**/api/offline*', route => route.fulfill({ json: state }));
      await page.route('**/api/workspace', route => route.fulfill({ json: state }));
      await page.goto('/offline?path=' + encodeURIComponent(requestedPath));
      await page.evaluate(async state => {
        localStorage.setItem('alumex_locale', 'en');
        localStorage.setItem('alumex-field-active', state.actor.id);
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('alumex-field-v1', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('accounts');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('accounts', 'readwrite');
            tx.objectStore('accounts').put(state, state.actor.id);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
        });
        window.dispatchEvent(new Event('field-change'));
      }, state);
      await expect(page.getByRole('heading', { name: 'Measurement assignments', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Phone sample 0', exact: true })).toBeVisible();
      for (const name of ['Phone sample 1', 'Phone sample 2', 'Phone sample 3', 'Project stages', 'All projects']) {
        await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
      }
      await expect(page.locator('nav button')).toHaveText(['Measurement assignments', 'New project']);
      await page.getByRole('link', { name: 'Record measurements', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Initial measurements', exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Project record' })).toContainText('Created by');
      await expect(page.getByRole('region', { name: 'Project record' }).locator('time')).toHaveText(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
      await page.getByRole('button', { name: 'New project', exact: true }).click();
      await expect(page.getByPlaceholder('Enter full name')).toBeVisible();
      await expect(page.locator('#outdoor-assignee')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto('/offline?path=/initial-measurements/' + projects[1].id);
      await expect(page.getByText('Measurements submitted', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue to quotation', exact: true })).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to assignments', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Measurement assignments', exact: true })).toBeVisible();
    });
  }
});

test.describe('Leadership dashboard clarity', () => {
  for (const role of ['Admin', 'Company Owner', 'Sales Director', 'CEO', 'Indoor Sales']) for (const locale of ['en', 'ar']) {
    test(`${role} ${locale}: stage colors, priorities and project actions`, async ({ page }) => {
      await page.setViewportSize({ width: locale === 'ar' ? 390 : 1440, height: 1000 });
      await page.addInitScript(locale => localStorage.setItem('alumex_locale', locale), locale);
      const actor = { ...fatma, role };
      const statuses = ['new_lead', 'new_lead', 'ready_for_quotation', 'quotation_in_progress', 'quotation_approved', 'contract_generated', 'contract_signed', 'transferred_to_operations', 'closed'];
      const names = ['Mansour residence', 'Riverside villa', 'Karrada office', 'Al Noor showroom', 'University annex', 'Jadriya apartments', 'Tigris tower', 'Baghdad clinic', 'West gate'];
      const projects = statuses.map((sales_status, index) => ({
        id: `11111111-1111-4111-8111-11111111111${index}`, project_name: names[index], project_number: `PRJ-LEADERSHIP-${index}`,
        structure_readiness: index ? 'ready' : 'not_ready', sales_status, status: index === 7 ? 'Production' : 'Draft',
        address: 'Baghdad · Site address', phone: '07700000000', created_by: ehab.id, registeredBy: ehab.name,
        assigned_outdoor_sales_id: ehab.id, assignedOutdoorSales: ehab.name, follow_up_owner_id: fatma.id, followUpOwner: fatma.name,
        next_follow_up_at: index === 3 ? new Date(Date.now() - 3600000).toISOString() : null,
        project_notes: 'Client requested a follow-up call.', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }));
      const state = { actor, projects, indoorSales: [fatma], outdoorSales: [ehab], queue: [], openings: [], syncedAt: null };
      await page.route('**/api/offline*', route => route.fulfill({ json: state }));
      await page.route('**/api/workspace', route => route.fulfill({ json: state }));
      await page.goto('/offline?path=/dashboard');
      await page.evaluate(async state => {
        localStorage.setItem('alumex-field-active', state.actor.id);
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('alumex-field-v1', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('accounts');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => { const db = request.result; const tx = db.transaction('accounts', 'readwrite'); tx.objectStore('accounts').put(state, state.actor.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
        });
        window.dispatchEvent(new Event('field-change'));
      }, state);
      const cards = page.locator('article');
      await expect(cards).toHaveCount(9);
      const colors = await cards.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderTopColor));
      expect(new Set(colors).size).toBe(6);
      expect(colors[2]).toBe(colors[3]);
      expect(colors[4]).toBe(colors[5]);
      const stageFilters = page.getByRole('region', { name: locale === 'en' ? 'Filter by project stage' : 'تصفية حسب مرحلة المشروع', exact: true });
      const measurementFilter = stageFilters.getByRole('button', { name: locale === 'en' ? /Initial measurements/ : /القياسات الأولية/ });
      await measurementFilter.click();
      await expect(measurementFilter).toHaveAttribute('aria-pressed', 'true');
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('Riverside villa');
      await expect(cards.first().getByRole('link', { name: locale === 'en' ? 'Review measurements' : 'مراجعة القياسات', exact: true })).toHaveAttribute('href', `/initial-measurements/${projects[1].id}`);
      await expect(cards.first()).toContainText('Fatma');
      await expect(cards.first()).toContainText('Ehab');
      await page.getByRole('region', { name: locale === 'en' ? 'Project overview' : 'نظرة عامة على المشروع', exact: true }).getByRole('button', { name: locale === 'en' ? /Overdue follow-ups/ : /متابعات متأخرة/ }).click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('Al Noor showroom');
      await page.getByRole('button', { name: locale === 'en' ? 'Clear filters' : 'مسح عوامل التصفية', exact: true }).click();
      await expect(cards).toHaveCount(9);
      await page.getByRole('searchbox').fill('no such project');
      await expect(cards).toHaveCount(0);
      await page.getByRole('searchbox').fill('Riverside');
      await expect(cards).toHaveCount(1);
      await cards.first().locator('summary').filter({ hasText: locale === 'en' ? 'Project details' : 'تفاصيل المشروع' }).click();
      await expect(cards.first().getByRole('link', { name: '07700000000', exact: true })).toHaveAttribute('href', 'tel:07700000000');
      await page.getByRole('searchbox').fill('');
      await expect(cards).toHaveCount(9);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
