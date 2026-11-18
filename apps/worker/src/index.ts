// placeholder —— 保证 `wrangler dev` 能起来。
// P0 会替换为 routeAgentRequest + ChatAgent（Durable Object 绑定届时加回 wrangler.jsonc）。
export default {
  fetch(): Response {
    return new Response("atoms-lite worker: skeleton");
  },
};
