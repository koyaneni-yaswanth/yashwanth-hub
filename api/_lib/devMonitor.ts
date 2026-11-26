/**
 * Real Development & Deployment Telemetry (GitHub REST API + Vercel Runtime / API).
 *
 * Uses strict allowlisted GitHub repo slugs and Vercel env/API metadata.
 * Never fabricates CI/commit/deployment telemetry when an upstream API fails.
 */

export interface DevMonitorReport {
  github: {
    repo: string;
    configuredToken: boolean;
    status: 'connected' | 'rate_limited' | 'error';
    openIssuesCount?: number;
    defaultBranch?: string;
    recentCommits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      url: string;
    }>;
    openPullRequests: Array<{
      number: number;
      title: string;
      state: string;
      url: string;
      updatedAt: string;
    }>;
    recentWorkflowRuns: Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      branch: string;
      createdAt: string;
      url: string;
    }>;
    error?: string;
  };
  vercel: {
    project: string;
    tokenConfigured: boolean;
    runtimeCommitSha: string | null;
    runtimeCommitMessage: string | null;
    runtimeCommitRef: string | null;
    runtimeRegion: string | null;
    latestDeployments: Array<{
      uid: string;
      url: string;
      state: string;
      target: string | null;
      createdAt: string;
      commitMessage?: string;
      branch?: string;
    }>;
    error?: string;
  };
  checkedAt: string;
}

const DEFAULT_REPO = 'koyaneni-yaswanth/yashwanth-hub';
const SAFE_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function fetchDevMonitorReport(
  options: { repo?: string; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}
): Promise<DevMonitorReport> {
  const env = options.env || {};
  const fetchImpl = options.fetchImpl || fetch;
  const rawRepo = (options.repo || env.GITHUB_REPO || DEFAULT_REPO).trim();
  const repo = SAFE_REPO_RE.test(rawRepo) ? rawRepo : DEFAULT_REPO;
  const githubToken = (env.GITHUB_TOKEN || '').trim();
  const vercelToken = (env.VERCEL_TOKEN || '').trim();
  const vercelProjectId = (env.VERCEL_PROJECT_ID || 'prj_0At1YSsFsDiRAfIqyEtj81hyCFTg').trim();

  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'YashwanthHub-DevMonitor/3.0',
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  };

  let githubResult: DevMonitorReport['github'] = {
    repo,
    configuredToken: Boolean(githubToken),
    status: 'connected',
    recentCommits: [],
    openPullRequests: [],
    recentWorkflowRuns: [],
  };

  try {
    const [repoRes, commitsRes, pullsRes, actionsRes] = await Promise.all([
      fetchImpl(`https://api.github.com/repos/${repo}`, { headers: ghHeaders, signal: AbortSignal.timeout(5000) }),
      fetchImpl(`https://api.github.com/repos/${repo}/commits?per_page=5`, {
        headers: ghHeaders,
        signal: AbortSignal.timeout(5000),
      }),
      fetchImpl(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=5`, {
        headers: ghHeaders,
        signal: AbortSignal.timeout(5000),
      }),
      fetchImpl(`https://api.github.com/repos/${repo}/actions/runs?per_page=5`, {
        headers: ghHeaders,
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (repoRes.status === 403 || repoRes.status === 429) {
      githubResult.status = 'rate_limited';
      githubResult.error = 'GitHub API rate limit reached; configure GITHUB_TOKEN in Vercel env.';
    } else if (!repoRes.ok) {
      githubResult.status = 'error';
      githubResult.error = `GitHub repo query returned HTTP ${repoRes.status}`;
    } else {
      const repoJson = await repoRes.json().catch(() => ({}));
      githubResult.openIssuesCount = typeof repoJson.open_issues_count === 'number' ? repoJson.open_issues_count : undefined;
      githubResult.defaultBranch = typeof repoJson.default_branch === 'string' ? repoJson.default_branch : undefined;
    }

    if (commitsRes.ok) {
      const commits = await commitsRes.json().catch(() => []);
      if (Array.isArray(commits)) {
        githubResult.recentCommits = commits.slice(0, 5).map((c: any) => ({
          sha: String(c?.sha || '').slice(0, 7),
          message: String(c?.commit?.message || '').split('\n')[0],
          author: String(c?.commit?.author?.name || c?.author?.login || ''),
          date: String(c?.commit?.author?.date || ''),
          url: String(c?.html_url || ''),
        }));
      }
    }

    if (pullsRes.ok) {
      const pulls = await pullsRes.json().catch(() => []);
      if (Array.isArray(pulls)) {
        githubResult.openPullRequests = pulls.slice(0, 5).map((p: any) => ({
          number: Number(p?.number || 0),
          title: String(p?.title || ''),
          state: String(p?.state || 'open'),
          url: String(p?.html_url || ''),
          updatedAt: String(p?.updated_at || ''),
        }));
      }
    }

    if (actionsRes.ok) {
      const actionsJson = await actionsRes.json().catch(() => ({}));
      const runs = Array.isArray(actionsJson?.workflow_runs) ? actionsJson.workflow_runs : [];
      githubResult.recentWorkflowRuns = runs.slice(0, 5).map((r: any) => ({
        id: Number(r?.id || 0),
        name: String(r?.name || 'Workflow'),
        status: String(r?.status || ''),
        conclusion: r?.conclusion ? String(r.conclusion) : null,
        branch: String(r?.head_branch || ''),
        createdAt: String(r?.created_at || ''),
        url: String(r?.html_url || ''),
      }));
    }
  } catch (err: any) {
    githubResult.status = 'error';
    githubResult.error = err?.message || 'GitHub network error';
  }

  const vercelResult: DevMonitorReport['vercel'] = {
    project: 'yashwanth-hub',
    tokenConfigured: Boolean(vercelToken),
    runtimeCommitSha: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    runtimeCommitMessage: env.VERCEL_GIT_COMMIT_MESSAGE || null,
    runtimeCommitRef: env.VERCEL_GIT_COMMIT_REF || null,
    runtimeRegion: env.VERCEL_REGION || null,
    latestDeployments: [],
  };

  if (vercelToken) {
    try {
      const teamQuery = env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
      const vRes = await fetchImpl(
        `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&limit=5${teamQuery}`,
        { headers: { Authorization: `Bearer ${vercelToken}` }, signal: AbortSignal.timeout(5000) }
      );
      if (vRes.ok) {
        const vJson = await vRes.json().catch(() => ({}));
        const dpls = Array.isArray(vJson?.deployments) ? vJson.deployments : [];
        vercelResult.latestDeployments = dpls.map((d: any) => ({
          uid: String(d?.uid || ''),
          url: String(d?.url || ''),
          state: String(d?.state || d?.readyState || ''),
          target: d?.target ? String(d.target) : null,
          createdAt: d?.created ? new Date(d.created).toISOString() : '',
          commitMessage: d?.meta?.githubCommitMessage ? String(d.meta.githubCommitMessage) : undefined,
          branch: d?.meta?.githubCommitRef ? String(d.meta.githubCommitRef) : undefined,
        }));
      } else {
        vercelResult.error = `Vercel API returned HTTP ${vRes.status}`;
      }
    } catch (err: any) {
      vercelResult.error = err?.message || 'Vercel API request failed';
    }
  }

  return {
    github: githubResult,
    vercel: vercelResult,
    checkedAt: new Date().toISOString(),
  };
}
