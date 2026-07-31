-- EliNotebook 私人帳號與加密保險庫資料結構
-- 執行前先在Supabase Dashboard關閉公開註冊，並只用Invite建立允許的帳號。
-- 所有公開schema資料表都啟用RLS；未登入者沒有任何資料權限。

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  mfa_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '私人帳號設定；不重複保存email、電話或密碼。';

create table if not exists public.encrypted_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_version integer not null default 1 check (vault_version >= 1),
  encryption_algorithm text not null default 'AES-256-GCM' check (encryption_algorithm = 'AES-256-GCM'),
  ciphertext text not null,
  data_iv text not null,
  kdf_algorithm text not null default 'PBKDF2-HMAC-SHA-256' check (kdf_algorithm in ('PBKDF2-HMAC-SHA-256', 'ARGON2ID')),
  kdf_salt text,
  kdf_iterations integer check (kdf_iterations is null or kdf_iterations between 600000 and 2000000),
  wrapped_dek_password text,
  password_wrap_iv text,
  wrapped_dek_recovery text,
  recovery_wrap_iv text,
  recovery_mode text not null default 'unavailable' check (recovery_mode in ('unavailable', 'offline-code', 'server-kms')),
  client_change_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((wrapped_dek_password is null) = (password_wrap_iv is null)),
  check ((wrapped_dek_recovery is null) = (recovery_wrap_iv is null))
);

comment on table public.encrypted_vaults is '只保存密文、IV與被包裝的資料金鑰；不得保存財務明文或使用者密碼。';

create table if not exists public.account_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null default '未命名裝置' check (char_length(device_label) <= 80),
  public_key text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_devices_user_id_idx on public.account_devices(user_id);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  event_result text not null check (event_result in ('success', 'failure', 'blocked')),
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

comment on table public.security_events is '僅供受信任後端寫入的安全稽核紀錄；禁止前端新增或修改。';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists encrypted_vaults_set_updated_at on public.encrypted_vaults;
create trigger encrypted_vaults_set_updated_at before update on public.encrypted_vaults
for each row execute function public.set_updated_at();

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- 若管理者在執行此遷移前已經邀請帳號，補建其profile；重複執行不會覆蓋既有設定。
insert into public.profiles (user_id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 80)
from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.encrypted_vaults enable row level security;
alter table public.encrypted_vaults force row level security;
alter table public.account_devices enable row level security;
alter table public.account_devices force row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;

revoke all on table public.profiles from anon;
revoke all on table public.encrypted_vaults from anon;
revoke all on table public.account_devices from anon;
revoke all on table public.security_events from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.encrypted_vaults to authenticated;
grant select, delete on table public.account_devices to authenticated;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id and account_status = 'active');

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id and account_status = 'active')
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id and account_status = 'active');

drop policy if exists encrypted_vaults_select_own on public.encrypted_vaults;
create policy encrypted_vaults_select_own on public.encrypted_vaults
for select to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

drop policy if exists encrypted_vaults_insert_own on public.encrypted_vaults;
create policy encrypted_vaults_insert_own on public.encrypted_vaults
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

drop policy if exists encrypted_vaults_update_own on public.encrypted_vaults;
create policy encrypted_vaults_update_own on public.encrypted_vaults
for update to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

drop policy if exists encrypted_vaults_delete_own on public.encrypted_vaults;
create policy encrypted_vaults_delete_own on public.encrypted_vaults
for delete to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

drop policy if exists account_devices_select_own on public.account_devices;
create policy account_devices_select_own on public.account_devices
for select to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

drop policy if exists account_devices_delete_own on public.account_devices;
create policy account_devices_delete_own on public.account_devices
for delete to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where profiles.user_id = (select auth.uid()) and profiles.account_status = 'active')
);

commit;
