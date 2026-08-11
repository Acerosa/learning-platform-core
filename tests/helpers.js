import { JSDOM } from "jsdom";

export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    entries: () => Object.fromEntries(values)
  };
}

export function dom(html = "<!doctype html><html><body></body></html>") {
  return new JSDOM(html, { url: "https://hub.example/", runScripts: "outside-only" });
}

function queryResult(data, error = null) {
  const filters = [];
  const query = {
    filters,
    select() { return query; },
    eq(column, value) { filters.push({ column, value }); return query; },
    order() { return query; },
    then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); }
  };
  return query;
}

export function fakeSupabase({
  session = null,
  views = {},
  rpcs = {},
  authErrors = {}
} = {}) {
  const calls = [];
  let currentSession = session;
  let authListener = null;
  const client = {
    calls,
    auth: {
      onAuthStateChange(listener) { authListener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: currentSession }, error: authErrors.getSession || null }; },
      async signInWithPassword(credentials) {
        calls.push({ type: "sign-in", credentials });
        if (authErrors.signIn) return { data: null, error: authErrors.signIn };
        currentSession = { access_token: "test-access-token", user: { id: "auth-user" } };
        authListener?.("SIGNED_IN", currentSession);
        return { data: { session: currentSession }, error: null };
      },
      async signUp(credentials) {
        calls.push({ type: "sign-up", credentials });
        if (authErrors.signUp) return { data: null, error: authErrors.signUp };
        return { data: { session: currentSession, user: { id: "auth-user" } }, error: null };
      },
      async signOut() {
        currentSession = null;
        authListener?.("SIGNED_OUT", null);
        return { error: authErrors.signOut || null };
      }
    },
    schema(name) {
      calls.push({ type: "schema", name });
      return {
        from(view) {
          calls.push({ type: "view", view });
          return queryResult(views[view] || []);
        },
        rpc(name, payload) {
          calls.push({ type: "rpc", name, payload });
          const value = typeof rpcs[name] === "function" ? rpcs[name](payload) : rpcs[name];
          return Promise.resolve({ data: value ?? [], error: null });
        }
      };
    }
  };
  return client;
}
