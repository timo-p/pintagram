'use strict';

const db = require('./services/db');
const subHours = require('date-fns/sub_hours');
const isBefore = require('date-fns/is_before');
const crypto = require('crypto');
const validate = require('validate.js');
const constraints = require('./constraints');
const jwt = require('jsonwebtoken');

const knex = db.getKnex();

const JWT_TOKEN_COOKIE = 'x-jwt-token';
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN;

const buildResponse = (body = null, statusCode = 200, headers = {}) => ({
  statusCode,
  headers: {
    ...headers,
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Expose-Headers': JWT_TOKEN_COOKIE
  },
  body: JSON.stringify(body),
});

const hash = (text, salt) => crypto.createHmac('sha256', salt)
  .update(text)
  .digest('hex');

const upperCaseFirstCharacter = (str) => `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;

const checkLogin = async (event) => {
  if (!event.headers['Authorization']) {
    return false;
  }
  const token = event.headers['Authorization'].replace(/^Bearer /, '');
  try {
    const user = jwt.verify(token, JWT_SECRET_KEY);
    return {user, token};
  } catch(e) {
    return false;
  }
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

const buildJwtToken = (user) => jwt.sign(user, JWT_SECRET_KEY, {expiresIn: '24h'});

const isTokenExpired = (token) => isBefore(new Date(token.iat * 1000), subHours(new Date(), 1));

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

  const token = buildJwtToken({
    first_name,
    last_name,
    username,
  });

  return buildResponse({
    first_name,
    last_name,
    username,
    password: unhashedPassword,
  }, 200, {
    [JWT_TOKEN_COOKIE]: token
  });
};

const wakeUpDb = (maxWaitTime) => new Promise((resolve) => {
  const timeout = setTimeout(() => {
    resolve();
  }, maxWaitTime);
  knex.raw('select now()').then(() => {
    clearTimeout(timeout);
    resolve();
  });
});

const waitUntilDbWorks = async (func, delay = 1000) => {
  return new Promise(async (resolve) => {
    try {
      await knex.raw('select now()').then();
      resolve();
    } catch(e) {
      console.log(`Caught error. Retrying after ${delay}ms. Error: ${e}`); // eslint-disable-line no-console
      const waiter = new Promise((waitResolve) => {
        setTimeout(() => waitResolve(), delay);
      });
      await waiter;
      return waitUntilDbWorks(func, delay);
    }
  });
};

const getUser = async (user) => buildResponse({
  username: user.username,
  first_name: user.first_name,
  last_name: user.last_name
});

const getUserPosts = async (user, username, queryParameters) => {
  const selects = [
    'posts.id',
    'posts.username',
    'posts.message',
    'posts.likes',
    'posts.created_at',
    'posts.updated_at',
    'users.first_name',
    'users.last_name',
  ];
  const query = knex('posts')
    .join('users', 'posts.username', 'users.username')
    .where({'posts.username': username})
    .orderBy('created_at')
    .limit(10);
  if (user) {
    query.select(selects.concat(
      knex.raw('case when likes.id is null then 0 else 1 end as is_liked')));
    query.leftJoin('likes', function() {
      this.on('posts.id', 'likes.post_id').andOnIn('likes.username', [user.username]);
    });
  } else {
    query.select(selects.concat(knex.raw('0 as is_liked')));
  }
  if (queryParameters.posts_before) {
    query.andWhere('posts.id', '<', queryParameters.posts_before);
  }
  const posts = await query.map((row) => ({...row, is_liked: !!row.is_liked}));
  return buildResponse(posts);
};

const getUsers = async (usersBefore) => {
  await knex.raw('SET @row_number = 0');
  const query = knex('users')
    .select('username', 'first_name', 'last_name', 'posts',
      knex.raw('(@row_number:=@row_number + 1) as ranking'))
    .orderBy('posts', 'desc')
    .orderBy('username');
  if (usersBefore) {
    query.offset(parseInt(usersBefore, 10));
  }
  const users = await query;
  return buildResponse(users);
};

const getUserByUsername = async (username) => {
  const user = await knex('users').select('username', 'first_name', 'last_name', 'posts').where('username', username).first();
  return buildResponse(user);
};

const updatePostCount = (username) =>
  knex('users').update({posts: knex('posts').count().where({username})}).where({username});

const createPost = async (user, message) => {
  const post = await knex.transaction(async (trx) => {
    await trx('posts').insert({
      username: user.username,
      message,
      created_at: new Date(),
    });
    return trx('posts').select('posts.id', 'posts.username', 'posts.message', 'posts.created_at',
      'posts.updated_at', 'posts.likes', 'users.first_name', 'users.last_name')
      .join('users', 'posts.username', 'users.username').whereRaw('posts.id = (select last_insert_id())').first();
  });
  await updatePostCount(user.username);
  return buildResponse(post);
};

const deletePost = async (id, user) => {
  const exists = await knex('posts').select(1).where({id, username: user.username}).limit(1).first();
  if (!exists) {
    return buildResponse(null, 401);
  }
  await knex('likes').where({post_id: id}).delete();
  await knex('posts').where({id}).delete();
  await updatePostCount(user.username);
  return buildResponse();
};

const follow = async (user, following) => {
  const exists = await knex('followers').where({username: user.username, following}).limit(1).first();
  if (exists) {
    return buildResponse(exists);
  }
  const added = await knex.transaction(async (trx) => {
    await trx('followers').insert({
      username: user.username,
      following,
      created_at: new Date(),
    });
    return trx('followers').whereRaw('id = (select last_insert_id())').first();
  });
  return buildResponse(added);
};

const updateLikeCount = (postId) =>
  knex('posts').update({likes: knex('likes').count().where({post_id: postId})}).where({id: postId});

const getPost = (postId) => knex('posts')
  .select(
    'posts.id',
    'posts.username',
    'posts.message',
    'posts.likes',
    'posts.created_at',
    'posts.updated_at',
    'users.first_name',
    'users.last_name',
  )
  .join('users', 'posts.username', 'users.username')
  .where('posts.id', postId)
  .limit(1)
  .first();

const like = async (user, postId) => {
  const exists = await knex('likes')
    .select(
      'posts.id',
      'posts.username',
      'posts.message',
      'posts.likes',
      'posts.created_at',
      'posts.updated_at',
      'users.first_name',
      'users.last_name',
    )
    .join('posts', function() {
      this.on('likes.post_id', 'posts.id').andOn('likes.username', 'posts.username');
    })
    .join('users', 'posts.username', 'users.username')
    .where({'likes.username': user.username, post_id: postId}).limit(1).first();
  if (exists) {
    return buildResponse({...exists, is_liked: true});
  }
  await knex('likes').insert({username: user.username, post_id: postId, created_at: new Date()});
  await updateLikeCount(postId);
  const post = await getPost(postId);
  return buildResponse({...post, is_liked: true});
};

const unlike = async (user, postId) => {
  await knex('likes').where({username: user.username, post_id: postId}).delete();
  await updateLikeCount(postId);
  const post = await getPost(postId);
  return buildResponse({...post, is_liked: false});
};

const unfollow = async (user, following) => {
  await knex('followers').where({username: user.username, following}).delete();
  return buildResponse();
};

const getFollowings = async (user) => {
  const followings = await knex('followers').where('username', user.username);
  return buildResponse(followings);
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
  const token = buildJwtToken({
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
  });
  return buildResponse({
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
  }, 200, {
    [JWT_TOKEN_COOKIE]: token
  });
};

const getTimeline = async (user, queryParameters) => {
  const usernames = knex('followers')
    .select('following')
    .where('username', user.username);
  const query = knex('posts').select(
    'posts.id',
    'posts.username',
    'posts.message',
    'posts.likes',
    'posts.created_at',
    'posts.updated_at',
    'users.first_name',
    'users.last_name',
    knex.raw('case when likes.id is null then 0 else 1 end as is_liked')
  )
    .join('users', 'posts.username', 'users.username')
    .leftJoin('likes', function() {
      this.on('posts.id', 'likes.post_id').andOnIn('likes.username', [user.username]);
    })
    .where((builder) => builder.whereIn('posts.username', usernames).orWhere('posts.username', user.username))
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(10);
  if (queryParameters.posts_before) {
    query.andWhere('posts.id', '<', queryParameters.posts_before);
  }
  const posts = await query.map((row) => ({ ...row, is_liked: !!row.is_liked }));
  return buildResponse(posts);
};

const query = async (body) => buildResponse(await knex.raw(body.query));

const getLines = async () => buildResponse(await knex('lines').pluck('line'));

const routes = [
  {
    resource: '/register',
    httpMethod: 'POST',
    authorize: false,
    action: () => register(),
  },
  {
    resource: '/user',
    httpMethod: 'GET',
    authorize: true,
    wakeUpDb: true,
    action: (event, {user}) => getUser(user),
  },
  {
    resource: '/users',
    httpMethod: 'GET',
    action: (event, {queryParameters}) => getUsers(queryParameters.users_before),
  },
  {
    resource: '/users/{username}',
    httpMethod: 'GET',
    action: (event, {pathParameters}) => getUserByUsername(pathParameters.username),
  },
  {
    resource: '/users/{username}/posts',
    httpMethod: 'GET',
    action: (event, {user, pathParameters, queryParameters}) => getUserPosts(user, pathParameters.username, queryParameters),
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
  {
    resource: '/follow',
    httpMethod: 'POST',
    authorize: true,
    constraints: constraints.follow,
    action: (event, {user, body}) => follow(user, body.follow),
  },
  {
    resource: '/unfollow',
    httpMethod: 'POST',
    authorize: true,
    constraints: constraints.follow,
    action: (event, {user, body}) => unfollow(user, body.follow),
  },
  {
    resource: '/followings',
    httpMethod: 'GET',
    authorize: true,
    action: (event, {user}) => getFollowings(user),
  },
  {
    resource: '/timeline',
    httpMethod: 'GET',
    authorize: true,
    action: (event, {user, queryParameters}) => getTimeline(user, queryParameters),
  },
  {
    resource: '/lines',
    httpMethod: 'GET',
    authorize: true,
    action: () => getLines(),
  },
  {
    resource: '/posts/{id}',
    httpMethod: 'DELETE',
    authorize: true,
    action: (event, {pathParameters, user}) => deletePost(pathParameters.id, user),
  },
  {
    resource: '/posts/{id}/likes',
    httpMethod: 'POST',
    authorize: true,
    action: (event, {pathParameters, user}) => like(user, pathParameters.id),
  },
  {
    resource: '/posts/{id}/likes',
    httpMethod: 'DELETE',
    authorize: true,
    action: (event, {pathParameters, user}) => unlike(user, pathParameters.id),
  },
  {
    resource: '/query',
    httpMethod: 'POST',
    action: (event, {body}) => query(body),
  },
];

const router = async (event, context) => {
  console.log(`Received event ${event.httpMethod} ${event.resource}`); // eslint-disable-line no-console
  const route = routes.find((r) => r.resource === event.resource && r.httpMethod === event.httpMethod);
  if (!route) {
    return buildResponse(null, 404);
  }
  if (route.wakeUpDb) {
    const maxWaitTime = context.getRemainingTimeInMillis() - 1000;
    console.log(`Waking up db. Waiting at max ${maxWaitTime}ms.`); // eslint-disable-line no-console
    await wakeUpDb(maxWaitTime);
    console.log('Db woke up'); // eslint-disable-line no-console
  }
  const loginCheckResult = await checkLogin(event);
  const user = loginCheckResult ? loginCheckResult.user : undefined;
  let token = loginCheckResult ? loginCheckResult.token : undefined;
  if (route.authorize) {
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

  if (!route.wakeUpDb) {
    console.log('Connecting to db'); // eslint-disable-line no-console
    await waitUntilDbWorks();
    console.log('Db connected up'); // eslint-disable-line no-console
  }

  const response = await route.action(event, {body, pathParameters, user, queryParameters});
  if (response.statusCode === 200 && user) {
    if (isTokenExpired(user)) {
      response.headers[JWT_TOKEN_COOKIE] = buildJwtToken({
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name
      });
    } else {
      response.headers[JWT_TOKEN_COOKIE] = token;
    }
  }
  return response;
};

module.exports = {
  router,
  register,
  generateSalt,
  upperCaseFirstCharacter
};
