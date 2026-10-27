// Comments shared by /api/comments and /api/data.
import { parseList } from './db.js';

export const REACTIONS = ['👍', '❤️', '🎉', '😂', '👀', '✅'];

export const shape = (c) => ({ ...c, mentions: parseList(c.mentions), reactions: parseReactions(c.reactions) });

export function parseReactions(v) {
  try {
    const r = JSON.parse(v || '{}');
    return r && typeof r === 'object' ? r : {};
  } catch {
    return {};
  }
}

export async function visibleComments(env, auth, taskIds) {
  const [comments, reads] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM comments ORDER BY created_at'),
    env.DB.prepare('SELECT parent_type, parent_id, read_at FROM comment_reads WHERE user_id = ?').bind(auth.user.id),
  ]);
  return {
    comments: comments.results.filter((c) => (c.parent_type === 'task' ? taskIds.has(c.parent_id) : auth.has('marketing'))).map(shape),
    commentReads: reads.results,
  };
}
