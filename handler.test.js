const handler = require('./handler');

test('generateSalt', () => {
  expect(handler.generateSalt().length).toBe(64);
});

test('upperCaseFirstCharacter', () => {
  expect(handler.upperCaseFirstCharacter('fooBar')).toEqual('FooBar');
});
