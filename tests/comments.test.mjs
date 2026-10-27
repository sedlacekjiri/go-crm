import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeMentions, encodeMentions, inboxItems, mentionLabel } from '../public/js/lib.js';

const users = [
  { id: 'owner', name: 'Jiří Sedláček' },
  { id: 'u1', name: 'Anna Berg' },
  { id: 'u2', name: 'Anna Tómasdóttir' },
  { id: 'u3', name: 'Þórdís Jóns' },
];

describe('mentions', () => {
  it('use the first name unless two people share it', () => {
    assert.equal(mentionLabel(users[3], users), 'Þórdís');
    assert.equal(mentionLabel(users[1], users), 'Anna Berg');
  });
  it('turn @names into ids and back', () => {
    const enc = encodeMentions('@Þórdís can you check this with @Anna Berg? cc @Jiří.', users);
    assert.equal(enc, '<@u3> can you check this with <@u1>? cc <@owner>.');
    assert.equal(decodeMentions(enc, users), '@Þórdís can you check this with @Anna Berg? cc @Jiří.');
  });
  it('leave e-mail addresses and unknown names alone', () => {
    assert.equal(encodeMentions('mail jiri@gorentals.is or @Bob', users), 'mail jiri@gorentals.is or @Bob');
    assert.equal(encodeMentions('@Þórdísa', users), '@Þórdísa');
  });
});

describe('inbox', () => {
  const c = (o) => ({ id: Math.random().toString(36), parent_type: 'task', parent_id: 't1', body: 'x', mentions: [], created_by: 'u1', created_at: '2026-10-27T10:00:00Z', ...o });
  const tasks = [
    { id: 't1', title: 'Print flyers', assignee_id: 'owner', subtasks: [] },
    { id: 't2', title: 'Other', assignee_id: 'u1', subtasks: [], followers: [] },
  ];
  it('shows new comments on my tasks and mentions elsewhere, newest first', () => {
    const data = {
      tasks,
      posts: [],
      comments: [c({}), c({ parent_id: 't2', mentions: ['owner'], created_at: '2026-10-27T11:00:00Z' }), c({ parent_id: 't2', created_by: 'u2' })],
      commentReads: [],
    };
    const items = inboxItems(data, 'owner');
    assert.deepEqual(items.map((i) => [i.parent.id, i.comments.length, i.mentioned]), [['t2', 2, true], ['t1', 1, false]]);
  });
  it('skips my own comments, read threads and things I am not part of', () => {
    const data = {
      tasks,
      posts: [],
      comments: [c({ created_by: 'owner' }), c({ created_at: '2026-10-27T09:00:00Z' }), c({ parent_id: 't2' })],
      commentReads: [{ parent_type: 'task', parent_id: 't1', read_at: '2026-10-27T09:30:00Z' }],
    };
    assert.deepEqual(inboxItems(data, 'owner'), []);
  });
  it('counts a thread I commented on', () => {
    const data = { tasks, posts: [], comments: [c({ parent_id: 't2', created_by: 'owner', created_at: '2026-10-27T08:00:00Z' }), c({ parent_id: 't2' })], commentReads: [{ parent_type: 'task', parent_id: 't2', read_at: '2026-10-27T08:00:00Z' }] };
    assert.equal(inboxItems(data, 'owner').length, 1);
  });
});
