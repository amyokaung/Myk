import {open, type DB} from '@op-engineering/op-sqlite';

let db: DB | null = null;

function getDb(): DB {
  if (!db) {
    db = open({
      name: 'myanmar_ai.db',
    });
  }

  return db;
}

export async function initDatabase() {
  const database = getDb();

  await database.execute(`PRAGMA foreign_keys = ON;`);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
    );
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id);
  `);
}

export async function createConversation(
  id: string,
  title: string,
) {
  const database = getDb();
  const now = Date.now();

  await database.execute(
    `INSERT INTO conversations
     (id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, title, now, now],
  );
}

export async function addMessage(
  id: string,
  conversationId: string,
  role: string,
  content: string,
) {
  const database = getDb();

  await database.execute(
    `INSERT INTO messages
     (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, conversationId, role, content, Date.now()],
  );

  await database.execute(
    `UPDATE conversations
     SET updated_at = ?
     WHERE id = ?`,
    [Date.now(), conversationId],
  );
}

export async function getMessages(
  conversationId: string,
) {
  const database = getDb();

  const result = await database.execute(
    `SELECT * FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    [conversationId],
  );

  return result.rows;
}

export async function getConversations() {
  const database = getDb();

  const result = await database.execute(
    `SELECT * FROM conversations
     ORDER BY updated_at DESC`,
  );

  return result.rows;
}

export async function deleteConversation(
  id: string,
) {
  const database = getDb();

  await database.execute(
    `DELETE FROM messages
     WHERE conversation_id = ?`,
    [id],
  );

  await database.execute(
    `DELETE FROM conversations
     WHERE id = ?`,
    [id],
  );
}
