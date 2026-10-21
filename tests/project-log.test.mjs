import assert from 'node:assert/strict';
import test from 'node:test';
import { projectVisitHistory } from '../src/lib/workflow/projectLog.ts';

test('log preserves earlier unsuccessful visits after another employee is assigned',()=>{
 const first={id:'first',projectId:'site',action:'delay-measurements',reason:'client_no_answer',note:'Site closed',recordedAt:'2026-10-20T09:00:00Z',recordedBy:'Outdoor employee'};
 const second={id:'rescheduled',projectId:'site',action:'assign-measurements',reason:null,note:'',recordedAt:'2026-10-21T09:00:00Z',recordedBy:'Indoor employee'};
 const project={id:'site',measurement_delayed:false,measurement_delayed_at:'2026-10-20T09:00:00+00:00',measurement_attempts:[first,second]};
 assert.deepEqual(projectVisitHistory(project).map(entry=>entry.id),['rescheduled','first']);
 assert.deepEqual(project.measurement_attempts,[first,second]);
});

test('older offline snapshots still show the recorded visit until full history downloads',()=>{
 const history=projectVisitHistory({id:'site',measurement_delayed_at:'2026-10-20T09:00:00Z',measurement_delay_reason:'client_no_answer',measurement_delay_note:'Site closed',measurementDelayedBy:'Outdoor employee'});
 assert.equal(history.length,1);assert.equal(history[0].reason,'client_no_answer');assert.equal(history[0].note,'Site closed');
});
