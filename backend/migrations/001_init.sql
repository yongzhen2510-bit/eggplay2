CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 40),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE plays (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_id text NOT NULL,
  won boolean,
  played_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plays_user_played_idx ON plays (user_id, played_at DESC);

CREATE TABLE chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author text NOT NULL CHECK (char_length(author) BETWEEN 1 AND 40),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_room_idx ON chat_messages (room, created_at DESC);
CREATE INDEX chat_messages_user_idx ON chat_messages (user_id);
