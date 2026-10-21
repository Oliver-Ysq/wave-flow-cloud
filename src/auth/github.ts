import type { AppConfig } from "../config.js";

/** GitHub /user 端点返回的最小身份字段。 */
export type GithubUser = {
  /** GitHub 数字 ID，终身不变，作为本地 users.github_id 的匹配键。 */
  readonly id: number;
  /** 登录名，可被用户修改，仅展示与同步。 */
  readonly login: string;
  /** 头像地址，可为空。 */
  readonly avatarUrl: string | null;
};

type GithubOAuthConfig = Pick<
  AppConfig,
  "githubClientId" | "githubClientSecret" | "githubRedirectUrl"
>;

/**
 * GitHub OAuth 客户端：拼授权地址、code 换 token、token 换用户。
 * fetch 可注入，单元测试无需真实网络。
 */
export class GithubOAuthClient {
  constructor(
    private readonly config: GithubOAuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** 构造 GitHub 授权页地址；state 由调用方生成并在回调时校验。 */
  buildAuthorizeUrl(state: string): string {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.config.githubClientId);
    url.searchParams.set("redirect_uri", this.config.githubRedirectUrl);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    return url.toString();
  }

  /** 服务器间交换：code + client_secret 换 access_token（浏览器不参与）。 */
  async exchangeCode(code: string): Promise<string> {
    // GitHub 该端点要求 application/x-www-form-urlencoded（JSON body 不保证被解析）。
    const form = new URLSearchParams({
      client_id: this.config.githubClientId,
      client_secret: this.config.githubClientSecret,
      code,
      redirect_uri: this.config.githubRedirectUrl,
    });
    const response = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!response.ok) {
      throw new Error(`GitHub 换取 token 失败：HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!body.access_token) {
      throw new Error(
        `GitHub 换取 token 失败：${body.error ?? "unknown"} ${body.error_description ?? ""}`.trim(),
      );
    }
    return body.access_token;
  }

  /** 用 access_token 读取当前用户的最小身份信息。 */
  async fetchUser(accessToken: string): Promise<GithubUser> {
    const response = await this.fetchImpl("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "wave-flow-cloud",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub 读取用户失败：HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      id: number;
      login: string;
      avatar_url?: string | null;
    };
    return { id: body.id, login: body.login, avatarUrl: body.avatar_url ?? null };
  }
}
