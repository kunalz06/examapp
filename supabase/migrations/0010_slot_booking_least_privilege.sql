-- Default project table privileges may grant direct writes to authenticated users.
-- RPCs run as their protected owner; do not expose unrestricted DML on the new tables.
revoke insert, update, delete, truncate, references, trigger
  on public.exam_assignments, public.exam_slots, public.exam_slot_bookings
  from authenticated, anon, public;

grant select on public.exam_assignments, public.exam_slots, public.exam_slot_bookings
  to authenticated;