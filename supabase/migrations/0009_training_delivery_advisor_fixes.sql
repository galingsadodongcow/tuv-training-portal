-- Cover the remaining delivery foreign key reported by the database advisor.
create index sessions_created_by_idx on academy_v2.sessions(created_by);
