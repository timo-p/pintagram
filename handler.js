'use strict';

const db = require('./services/db');
const subHours = require('date-fns/sub_hours');
const crypto = require('crypto');
const validate = require('validate.js');
const constraints = require('./constraints');

const knex = db.getKnex();

const buildResponse = (body = null, statusCode = 200) => ({
  statusCode,
  body: JSON.stringify(body),
});

const hash = (text, salt) => crypto.createHmac('sha256', salt)
  .update(text)
  .digest('hex');

const upperCaseFirstCharacter = (str) => `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;

const cleanSessions = () => knex('sessions').where('created_at', '<', subHours(new Date(), 24)).delete();

const checkLogin = async (event) => {
  if (!event.headers['x-session-id']) {
    return false;
  }
  const id = event.headers['x-session-id'];
  const user = await knex('users')
    .select('users.*')
    .innerJoin('sessions', 'users.username', 'sessions.username')
    .where('sessions.id', id)
    .andWhere((builder) =>
      builder.where('sessions.updated_at', '>', subHours(new Date(), 24))
        .orWhereNull('sessions.updated_at')
    )
    .first();

  if (!user) {
    return false;
  }

  await knex('sessions').update('updated_at', new Date()).where({id});

  return user;
};

const generateSalt = (length = 64) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  let salt = [];
  for (var i = 0; i < length; i++) {
    let char = chars[Math.floor(Math.random() * chars.length)];
    char = Math.floor(Math.random() * 2) ? char : char.toUpperCase();
    salt.push(char);
  }
  return salt.join('');
};

const createSession = async (username) => {
  const id = generateSalt(32);

  await knex('sessions').insert({
    username,
    id,
    created_at: new Date(),
  });

  return knex('sessions').where({id}).first();
};

const register = async () => {
  const {first_name, last_name} = await knex.select('sub1.first_name', 'sub2.last_name')
    .from(function() {
      this.select('first_name').from('first_names').orderByRaw('rand()').limit(100).as('sub1');
    })
    .innerJoin(function() {
      this.select('last_name').from('last_names').orderByRaw('rand()').limit(100).as('sub2');
    })
    .leftJoin('users', function() {
      this.on('sub1.first_name', '=', 'users.first_name').andOn('sub2.last_name', '=', 'users.last_name');
    })
    .whereNull('users.username')
    .limit(1)
    .first();

  const {adjective, noun} = await knex.select('adjective', 'noun')
    .from(function() {
      this.select('adjective').from('adjectives').orderByRaw('rand()').as('sub1');
    })
    .innerJoin(function() {
      this.select('noun').from('nouns').orderByRaw('rand()').as('sub2');
    })
    .limit(1)
    .first();

  const unhashedPassword = `${upperCaseFirstCharacter(adjective)}${upperCaseFirstCharacter(noun)}`;

  const username = `${first_name}.${last_name}`.toLowerCase();
  const salt = generateSalt();
  const password = hash(unhashedPassword, salt);
  
  await knex('users').insert({
    first_name,
    last_name,
    username,
    password,
    salt,
    created_at: knex.raw('now()'),
  });

  const sessionId = generateSalt(32);
  const session = await createSession(username, sessionId);

  return buildResponse({
    first_name,
    last_name,
    username,
    password: unhashedPassword,
    session_id: session.id,
  });
};

const getUserPosts = async (username, queryParameters) => {
  const query = knex('posts').where({username}).orderBy('created_at').limit(20);
  if (queryParameters.posts_before) {
    query.andWhere('id', '<', queryParameters.posts_before);
  }
  const posts = await query;
  return buildResponse(posts);
};

const createPost = async (user, message) => {
  const post = await knex.transaction(async (trx) => {
    await trx('posts').insert({
      username: user.username,
      message,
      created_at: new Date(),
    });
    return trx('posts').whereRaw('id = (select last_insert_id())').first();
  });
  return buildResponse(post);
};

const login = async (username, password) => {
  const user = await knex('users').where({username}).first();
  if (!user) {
    return buildResponse(null, 400);
  }
  const hashed = hash(password, user.salt);
  if (hashed !== user.password) {
    return buildResponse(null, 400);
  }
  const sessionId = generateSalt(32);
  const session = await createSession(username, sessionId);
  return buildResponse({
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    session_id: session.id,
  });
};

const routes = [
  {
    resource: '/register',
    httpMethod: 'POST',
    authorize: false,
    action: () => register(),
  },
  {
    resource: '/users/{username}/posts',
    httpMethod: 'GET',
    authorize: true,
    action: (event, {pathParameters, queryParameters}) => getUserPosts(pathParameters.username, queryParameters),
  },
  {
    resource: '/login',
    httpMethod: 'POST',
    authorize: false,
    action: (event, {body}) => login(body.username, body.password),
  },
  {
    resource: '/posts',
    httpMethod: 'POST',
    authorize: true,
    constraints: constraints.posts,
    action: (event, {user, body}) => createPost(user, body.message),
  },
];

const router = async (event) => {
  if (Math.floor(Math.random() * 101) % 100 === 0) {
    await cleanSessions();
  }
  const route = routes.find((r) => r.resource === event.resource && r.httpMethod === event.httpMethod);
  if (!route) {
    return buildResponse(null, 404);
  }
  let user;
  if (route.authorize) {
    user = await checkLogin(event);
    if (!user) {
      return buildResponse(null, 401);
    }
  }

  const body = (event.body && JSON.parse(event.body)) || {};
  const pathParameters = event.pathParameters || {};
  const queryParameters = event.queryStringParameters || {};

  if (route.constraints) {
    const routeConstraints = await route.constraints();
    const errors = validate(body, routeConstraints);
    if (errors) {
      return buildResponse(errors, 400);
    }
  }

  return await route.action(event, {body, pathParameters, user, queryParameters});
};

module.exports = {
  router,
  register,
  generateSalt,
  upperCaseFirstCharacter
};
