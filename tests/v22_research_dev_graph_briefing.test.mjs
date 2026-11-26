import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'https://unit-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'unit-test-anon-key';

const {
  DEFAULT_RESEARCH_TOPICS,
  fetchResearchIntelligence,
  parseArxivAtomXml,
  parseCrossrefWorks,
  parseOpenAlexWorks,
} = await import('../api/_lib/researchConnectors.ts');
const { fetchDevMonitorReport } = await import('../api/_lib/devMonitor.ts');
const { createIntegrationsSyncHandler } = await import('../api/integrations/sync.ts');
const { buildKnowledgeGraph } = await import('../src/lib/knowledgeGraph.ts');
const { destinationForTab } = await import('../src/lib/hubArchitecture.ts');

function fakeRes() {
  const out = { code: 200, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status: (c) => { out.code = c; return res; },
    json: (b) => { out.body = b; return res; },
    end: () => res,
  };
  return { res, out };
}

test('Research Connectors parse arXiv Atom, OpenAlex inverted abstract, Crossref, and deduplicate', async () => {
  const sampleXml = `
    <feed>
      <entry>
        <id>http://arxiv.org/abs/2611.0001</id>
        <title>Aerodynamic Optimization of Archimedes Spiral Wind Turbine Blades</title>
        <summary>Low wind speed rotor blade performance with planetary gearbox torque scaling.</summary>
        <published>2026-11-20T00:00:00Z</published>
        <author><name>A. Patel</name></author>
      </entry>
    </feed>
  `;
  const parsedXml = parseArxivAtomXml(sampleXml, ['wind', 'turbine']);
  assert.equal(parsedXml.length, 1);
  assert.ok(parsedXml[0].url.startsWith('https://arxiv.org'));
  assert.ok(parsedXml[0].relevanceScore >= 40);

  const oaParsed = parseOpenAlexWorks(
    {
      results: [
        {
          id: 'https://openalex.org/W123',
          title: 'Magnetic Gear Axial Flux Wind Turbine Generator',
          publication_date: '2026-11-15',
          doi: 'https://doi.org/10.1000/test',
          abstract_inverted_index: { Wind: [0], turbine: [1], magnetic: [2], gear: [3] },
          cited_by_count: 14,
        },
      ],
    },
    ['magnetic']
  );
  assert.equal(oaParsed[0].summary, 'Wind turbine magnetic gear');
  assert.equal(oaParsed[0].citedByCount, 14);

  const crParsed = parseCrossrefWorks(
    {
      message: {
        items: [
          {
            title: ['ROS 2 mmWave Radar SLAM for Autonomous UAVs'],
            DOI: '10.1000/radar',
            published: { 'date-parts': [[2026, 11, 10]] },
          },
        ],
      },
    },
    ['radar']
  );
  assert.equal(crParsed[0].publishedDate, '2026-11-10');

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('export.arxiv.org')) return new Response(sampleXml, { status: 200 });
    if (u.includes('api.openalex.org')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    if (u.includes('api.crossref.org')) return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };

  assert.ok(DEFAULT_RESEARCH_TOPICS.length >= 4);
  const feed = await fetchResearchIntelligence('wind turbine', mockFetch, 5);
  assert.equal(feed.success, true);
  assert.equal(feed.papers.length, 1);
  assert.equal(feed.sourceStatus.arxiv.ok, true);
});

test('Dev Monitor reports real GitHub commits/PRs/Actions and Vercel runtime without fabricating deployments', async () => {
  const mockFetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/repos/koyaneni-yaswanth/yashwanth-hub')) {
      return new Response(JSON.stringify({ open_issues_count: 2, default_branch: 'main' }), { status: 200 });
    }
    if (u.includes('/commits')) {
      return new Response(
        JSON.stringify([{ sha: '585c989abcdef', commit: { message: 'feat: milestone 1', author: { name: 'Yashwanth', date: '2026-11-26T14:00:00Z' } }, html_url: 'https://github.com/commit/585' }]),
        { status: 200 }
      );
    }
    if (u.includes('/pulls')) return new Response(JSON.stringify([]), { status: 200 });
    if (u.includes('/actions/runs')) {
      return new Response(JSON.stringify({ workflow_runs: [{ id: 1, name: 'CI', status: 'completed', conclusion: 'success', head_branch: 'v4-jarvis-hud', created_at: '2026-11-26T14:00:00Z', html_url: 'https://github.com/actions/1' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const report = await fetchDevMonitorReport({
    env: { VERCEL_GIT_COMMIT_SHA: '585c989b', VERCEL_GIT_COMMIT_REF: 'v4-jarvis-hud', VERCEL_REGION: 'iad1' },
    fetchImpl: mockFetch,
  });
  assert.equal(report.github.status, 'connected');
  assert.equal(report.github.recentCommits[0].sha, '585c989');
  assert.equal(report.github.recentWorkflowRuns[0].conclusion, 'success');
  assert.equal(report.vercel.runtimeCommitSha, '585c989');
  assert.equal(report.vercel.latestDeployments.length, 0);

  const handler = createIntegrationsSyncHandler(mockFetch);
  const call = fakeRes();
  await handler({ method: 'GET', query: { action: 'dev_status' }, headers: {} }, call.res);
  assert.equal(call.out.code, 200);
  assert.equal(call.out.body.github.repo, 'koyaneni-yaswanth/yashwanth-hub');
});

test('Knowledge Graph builds deterministic explicit ID & shared-area connections without speculative merges', () => {
  const graph = buildKnowledgeGraph({
    projects: [{ id: 'p1', title: 'Pawan Shakti TRL 5', area: 'PAWAN SHAKTI', status: 'active', progress: 45 }],
    tasks: [
      { id: 't1', text: 'Generator load CSV', area: 'PAWAN SHAKTI', project_id: 'p1', priority: 'urgent', done: false },
      { id: 't2', text: 'Unrelated task', area: 'OtherArea', priority: 'low', done: false },
    ],
    goals: [{ id: 'g1', title: 'Reach TRL 5', area: 'PAWAN SHAKTI', status: 'active' }],
    habits: [{ id: 'h1', title: 'Daily lab log', goal_id: 'g1', area: 'PAWAN SHAKTI', weekly_target: 7 }],
    notes: [{ id: 'n1', title: 'Blade pitch calc', area: 'PAWAN SHAKTI', project_id: 'p1' }],
    robotics: [{ id: 'r1', project: 'AgileX PiPER', title: 'SocketCAN bring-up', status: 'active' }],
  });

  assert.equal(graph.stats.nodeCount, 7);
  assert.ok(graph.stats.explicitEdges >= 3, 'explicit project_id and goal_id links must be counted');
  assert.ok(!graph.edges.some((e) => e.from === 'task:t2' || e.to === 'task:t2'), 'unrelated task stays isolated');
  assert.equal(destinationForTab('research-feed').id, 'intelligence');
});
