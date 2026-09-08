/**
 * Edge Function `delete-account` (Deno).
 *
 * Smaže účet a všechna osobní data přihlášeného uživatele (GDPR – právo na
 * výmaz). Řádek v `auth.users` smí smazat jen service_role, proto to nejde
 * z klienta a běží to tady.
 *
 * Postup:
 *  1) ověří JWT a zjistí uid volajícího (nikdo nemaže cizí účet),
 *  2) smaže fotky ve Storage pod prefixem `{uid}/`,
 *  3) projede tabulky v pořadí závislostí (děti před rodiči) service klientem,
 *  4) smaže samotného auth uživatele (kaskáda dorovná zbytek).
 *
 * Nasazení: `supabase functions deploy delete-account`.
 * Pozn.: běží v Deno runtime, ne ve Vitestu. Pořadí mazání je zrcadlené z
 * balíčku @dietapp/gdpr a kryté jeho testy.
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TABLE_SPECS, type TableSpec } from '../_shared/gdpr.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const ownerColumnOf = (table: string): string | undefined =>
  TABLE_SPECS.find((s: TableSpec) => s.table === table)?.ownerColumn;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Uid z JWT – maže se výhradně vlastní účet.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id ?? '';
  if (userErr || !userId) return json(401, { error: 'unauthorized' });

  const admin = createClient(supabaseUrl, serviceKey);
  const deleted: Record<string, number> = {};

  try {
    // 1) Storage: fotky jídel pod prefixem {uid}/.
    const { data: files } = await admin.storage.from('meal-photos').list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f: { name: string }) => `${userId}/${f.name}`);
      await admin.storage.from('meal-photos').remove(paths);
      deleted['storage:meal-photos'] = paths.length;
    }

    // 2) Tabulky v pořadí děti → rodiče.
    for (const spec of TABLE_SPECS) {
      if (spec.ownerColumn) {
        const { error, count } = await admin
          .from(spec.table)
          .delete({ count: 'exact' })
          .eq(spec.ownerColumn, userId);
        if (error) throw new Error(`${spec.table}: ${error.message}`);
        deleted[spec.table] = count ?? 0;
      } else if (spec.parent) {
        const parentOwner = ownerColumnOf(spec.parent.table);
        if (!parentOwner) throw new Error(`chybí vlastník rodiče ${spec.parent.table}`);
        const { data: parents, error: pErr } = await admin
          .from(spec.parent.table)
          .select('id')
          .eq(parentOwner, userId);
        if (pErr) throw new Error(`${spec.parent.table} (id): ${pErr.message}`);
        const ids = (parents ?? []).map((r: { id: string }) => r.id);
        if (ids.length > 0) {
          const { error, count } = await admin
            .from(spec.table)
            .delete({ count: 'exact' })
            .in(spec.parent.fk, ids);
          if (error) throw new Error(`${spec.table}: ${error.message}`);
          deleted[spec.table] = count ?? 0;
        } else {
          deleted[spec.table] = 0;
        }
      }
    }

    // 3) Samotný auth uživatel (kaskáda dorovná případný zbytek).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(`auth.deleteUser: ${delErr.message}`);
  } catch (e) {
    return json(500, { error: 'delete_failed', detail: String((e as Error)?.message ?? e), deleted });
  }

  return json(200, { status: 'deleted', userId, deleted });
});
