
-- 1. Enum extensions
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'treasurer';
ALTER TYPE public.contribution_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.contribution_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.contribution_status ADD VALUE IF NOT EXISTS 'verification_requested';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'hospital';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'school';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'retirement';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'disaster';
