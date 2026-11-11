import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificationMeta, operatorLine, contactLink, finishPage } from '../src/html.js';

test('verification tags are built from name=content pairs and escaped', () => {
  assert.equal(verificationMeta(''), '');
  assert.equal(verificationMeta('skimlinks-site-verification=abc123'), '<meta name="skimlinks-site-verification" content="abc123">');
  const two = verificationMeta('a=1|google-site-verification=x"y');
  assert.match(two, /<meta name="a" content="1">/);
  assert.match(two, /content="x&quot;y"/);
  assert.equal(verificationMeta('bad name<script>=1|=nothing|noequals'), '');
});

test('operator line suits a sole trader now and a company later', () => {
  assert.equal(operatorLine({}), '[OPERATOR NAME]');
  assert.equal(operatorLine({ operatorName: 'Sam Smith' }), 'Sam Smith');
  assert.equal(operatorLine({ operatorName: 'Turned Out Ltd', companyNumber: '12345678', operatorAddress: '1 High St, London' }),
    'Turned Out Ltd, registered in England and Wales (company number 12345678), 1 High St, London');
});

test('contact email placeholder stays visible until a real address is set', () => {
  assert.equal(contactLink({ contactEmail: 'hello@example.com' }), '[CONTACT EMAIL]');
  assert.equal(contactLink({ contactEmail: 'hello@turnedout.co.uk' }), '<a href="mailto:hello@turnedout.co.uk">hello@turnedout.co.uk</a>');
});

test('finishPage fills every placeholder and adds tags to the head', () => {
  const out = finishPage('<head><title>x</title></head><p>{{operator}} {{contact}} {{contact}}</p>',
    { operatorName: 'Sam', contactEmail: 'a@b.co', siteVerification: 'v=1' });
  assert.doesNotMatch(out, /\{\{/);
  assert.match(out, /<meta name="v" content="1">\n<\/head>/);
});
