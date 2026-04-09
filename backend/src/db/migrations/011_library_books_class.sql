ALTER TABLE library_books
  ADD COLUMN IF NOT EXISTS class_id TEXT REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_books_class_id ON library_books (class_id);
