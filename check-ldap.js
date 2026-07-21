const ldap = require('ldapjs');

const client = ldap.createClient({
  url: 'ldap://10.40.10.204:389',
});

client.bind('', '', (err) => {
  if (err) {
    console.error('LDAP bind failed:', err);
    process.exit(1);
  }

  const opts = {
    filter: '(|(cn=140287)(sAMAccountName=140287)(uid=140287))',
    scope: 'sub',
    attributes: ['dn', 'cn', 'mail', 'userPrincipalName', 'sAMAccountName']
  };

  client.search('ou=GTI,DC=gti,DC=com', opts, (err, res) => {
    if (err) {
      console.error('LDAP search failed:', err);
      process.exit(1);
    }

    res.on('searchEntry', (entry) => {
      console.log('entry: ' + JSON.stringify(entry.pojo));
    });

    res.on('error', (err) => {
      console.error('search error: ' + err.message);
    });

    res.on('end', (result) => {
      console.log('Search ended');
      client.unbind();
      process.exit(0);
    });
  });
});
