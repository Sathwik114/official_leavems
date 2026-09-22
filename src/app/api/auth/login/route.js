import { NextResponse } from 'next/server';
import * as jose from 'jose';
import ldap from 'ldapjs';
import { getDashboardRedirectForUser } from '@/lib/leaveApprovalConfig';



function buildCandidateDns(username, baseDN) {
  const normalized = (username || '').trim();
  if (!normalized) return [];

  const parts = [normalized];
  if (normalized.includes('\\')) parts.push(normalized.split('\\').pop());
  if (normalized.includes('@')) parts.push(normalized.split('@')[0]);

  const domain = (process.env.LDAP_DOMAIN || '').trim();
  const derivedDomain = baseDN
    ? baseDN
        .split(',')
        .filter((part) => part.toLowerCase().startsWith('dc='))
        .map((part) => part.split('=').pop())
        .join('.')
    : '';

  const domainSuffix = domain || derivedDomain;
  const candidates = new Set();
  parts.forEach((part) => {
    const cleanPart = part.trim();
    if (!cleanPart) return;

    candidates.add(cleanPart);
    if (domainSuffix) {
      candidates.add(`${cleanPart}@${domainSuffix}`);
    }

    if (baseDN) {
      candidates.add(`CN=${cleanPart},${baseDN}`);
      candidates.add(`cn=${cleanPart},${baseDN}`);
      candidates.add(`uid=${cleanPart},${baseDN}`);
      candidates.add(`sAMAccountName=${cleanPart},${baseDN}`);
      candidates.add(`${cleanPart},${baseDN}`);
    }
  });

  const template = process.env.LDAP_BIND_TEMPLATE?.trim();
  if (template) {
    const rendered = template
      .replace('{username}', normalized)
      .replace('{domain}', domainSuffix)
      .replace('{baseDN}', baseDN || '');
    if (rendered) candidates.add(rendered);
  }

  return Array.from(candidates);
}

function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    const ldapUrl = process.env.LDAP_URL?.trim();
    const baseDN = process.env.LDAP_BASE_DN?.trim();

    if (!ldapUrl || !baseDN) {
      return reject(new Error('LDAP server is not configured'));
    }

    const client = ldap.createClient({
      url: ldapUrl,
      connectTimeout: 10000,
      timeout: 5000,
    });

    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    client.on('error', (err) => {
      if (!settled) {
        finish(() => reject(new Error('LDAP connection failed: ' + err.message)));
      }
    });

    const candidateDns = buildCandidateDns(username, baseDN);
    if (!candidateDns.length) {
      return finish(() => reject(new Error('LDAP bind DN could not be constructed')));
    }

    let lastError = null;

    const tryNextBind = (index) => {
      if (index >= candidateDns.length) {
        return finish(() => reject(lastError || new Error('Invalid username or password')));
      }

      const bindValue = candidateDns[index];
      client.bind(bindValue, password, (err) => {
        if (err) {
          lastError = new Error('Invalid username or password');
          return tryNextBind(index + 1);
        }

        client.unbind(() => {
          finish(() => resolve(bindValue));
        });
      });
    };

    tryNextBind(0);
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = body.username || body.userId;
    const password = body.password;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    let userDN;
    try {
      userDN = await ldapAuthenticate(username, password);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new jose.SignJWT({
      id: userDN,
      username,
      name: username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(secret);

    const requestUrl = new URL(request.url);
    const secureCookie = requestUrl.protocol === 'https:' && process.env.NODE_ENV === 'production';

    // Authentication must not fail just because the role database is unavailable.
    // The dashboard will apply database-backed permissions after the session starts.
    let redirectPath = '/dashboard';
    try {
      redirectPath = await getDashboardRedirectForUser(username);
    } catch (roleError) {
      console.error('Leave role lookup failed during login:', roleError);
    }
    const response = NextResponse.json(
      { message: 'Logged in successfully', username, redirectPath },
      { status: 200 }
    );

    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 2,
    });

    return response;
  } catch (error) {
    console.error('LDAP login error:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred during login' },
      { status: 500 }
    );
  }
}
