export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { location, memory, initials } = req.body || {};
    if (!location || typeof location !== 'string') return res.status(400).send('invalid location');
    if (!memory || String(memory).trim().length < 3) return res.status(400).send('memory too short');
    if (!/^([A-Za-z]{2,3})$/.test(initials || '')) return res.status(400).send('invalid initials');

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const path = process.env.MEMORIES_PATH || 'memories.json';
    const branch = process.env.BRANCH || 'main';
    const token = process.env.GITHUB_TOKEN;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': `${owner}-${repo}-memories-app`
    };

    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const getResp = await fetch(getUrl, { headers });
    if (!getResp.ok) {
      const t = await getResp.text();
      return res.status(500).send(`Failed to fetch memories.json: ${t}`);
    }
    const fileMeta = await getResp.json();
    const sha = fileMeta.sha;
    const decoded = Buffer.from(fileMeta.content, 'base64').toString('utf8');

    let data;
    try { data = JSON.parse(decoded); }
    catch { return res.status(500).send('memories.json is not valid JSON'); }

    const created = Date.now();
    data[location] = Array.isArray(data[location]) ? data[location] : [];
    data[location].push({
      location,
      memory: String(memory).trim(),
      initials: String(initials).toLowerCase(),
      created
    });

    const newContent = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const commitResp = await fetch(putUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `add memory to ${location}`,
        content: newContent,
        sha,
        branch
      })
    });

    if (!commitResp.ok) {
      const t = await commitResp.text();
      return res.status(500).send(`Failed to commit memories.json: ${t}`);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).send('server error');
  }
}
