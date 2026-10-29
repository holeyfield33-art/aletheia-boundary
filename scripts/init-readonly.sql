-- Sample schema + read-only role + writable role + write canary
-- for Aletheia Boundary integration tests.

CREATE TABLE public.users (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  email text,
  ssn   text
);

CREATE TABLE public.orders (
  id      serial PRIMARY KEY,
  user_id int REFERENCES public.users(id),
  status  text NOT NULL,
  amount  numeric(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.analytics_daily (
  date    date NOT NULL,
  metric  text NOT NULL,
  value   numeric NOT NULL,
  segment text
);

-- Persistent canary: MUST stay empty. Any row means an unauthorized write landed.
CREATE TABLE public.write_canary (
  id   serial PRIMARY KEY,
  note text,
  at   timestamptz DEFAULT now()
);

INSERT INTO public.users (name, email, ssn) VALUES
  ('alice', 'alice@example.com', '111-22-3333'),
  ('bob',   'bob@example.com',   '222-33-4444'),
  ('carol', 'carol@example.com', '333-44-5555');

INSERT INTO public.orders (user_id, status, amount) VALUES
  (1, 'paid',    42.00),
  (1, 'pending', 15.50),
  (2, 'paid',    99.00),
  (3, 'refunded', 7.25);

INSERT INTO public.analytics_daily (date, metric, value, segment) VALUES
  ('2026-10-01', 'revenue', 1200.50, 'west'),
  ('2026-10-01', 'revenue',  890.00, 'east'),
  ('2026-10-02', 'signups',   42,    'west'),
  ('2026-10-02', 'signups',   31,    'east');

-- Read-only role: SELECT only, no DDL, no write.
CREATE ROLE readonly WITH LOGIN PASSWORD 'readonly' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE boundary TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM readonly;
REVOKE CREATE ON SCHEMA public FROM readonly;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Deliberately writable role: used to prove the startup probe REFUSES it.
CREATE ROLE writable WITH LOGIN PASSWORD 'writable' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE boundary TO writable;
GRANT USAGE, CREATE ON SCHEMA public TO writable;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO writable;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO writable;
