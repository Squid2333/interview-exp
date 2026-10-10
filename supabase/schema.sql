BEGIN;

CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '其他',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','learning','mastered')),
  review_interval_days INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  next_review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('ai','manual')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_message_id TEXT REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id TEXT PRIMARY KEY,
  usage_date TEXT NOT NULL,
  model_role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Seed defaults only when the catalog is first created. Re-running setup must not
-- restore categories the owner deliberately renamed or removed.
DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL THEN
    CREATE TABLE public.categories (
      name TEXT PRIMARY KEY,
      sequence_id BIGINT GENERATED ALWAYS AS IDENTITY
    );
    INSERT INTO public.categories (name) VALUES
      ('Java'), ('Spring'), ('数据库'), ('Redis'), ('计算机网络'),
      ('操作系统'), ('算法'), ('前端'), ('系统设计'), ('其他');
  END IF;
END $$;

-- Include any older question category, even if it was never in the preset list.
INSERT INTO public.categories (name)
SELECT DISTINCT category FROM public.questions
ON CONFLICT (name) DO NOTHING;
INSERT INTO public.categories (name) VALUES ('其他') ON CONFLICT (name) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_casefold_idx ON public.categories (lower(name));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_category_fkey'
  ) THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_category_fkey
      FOREIGN KEY (category) REFERENCES public.categories(name)
      ON UPDATE CASCADE ON DELETE SET DEFAULT;
  END IF;
END $$;

-- Preserve insertion order when timestamps match, including a pair of chat messages.
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS sequence_id BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE INDEX IF NOT EXISTS answers_question_idx ON public.answers(question_id, created_at DESC, sequence_id DESC);
CREATE INDEX IF NOT EXISTS messages_question_idx ON public.messages(question_id, created_at, sequence_id);
CREATE INDEX IF NOT EXISTS notes_question_idx ON public.notes(question_id, created_at DESC, sequence_id DESC);
CREATE INDEX IF NOT EXISTS ai_usage_date_idx ON public.ai_usage(usage_date);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Database connections stay on the server. No browser access policies are created.
REVOKE ALL ON TABLE public.questions, public.answers, public.messages, public.notes, public.ai_usage, public.categories FROM anon, authenticated;

COMMIT;
