window.calcEval = function(expr) {
  try {
    var result = evaluate(expr);
    if (typeof result === 'number' && isFinite(result)) {
      return { success: true, result: result };
    }
    return { success: true, result: String(result) };
  } catch (e) {
    return { success: false, error: e.message || 'Invalid expression' };
  }
};

var FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, log10: Math.log,
  ln: Math.log, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, exp: Math.exp
};

var CONSTANTS = { pi: Math.PI, e: Math.E };

var PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

function tokenize(expr) {
  var tokens = [];
  var i = 0;
  while (i < expr.length) {
    if (expr[i] <= ' ' || expr[i] === ',') { i++; continue; }
    if ('+-*/%^()'.indexOf(expr[i]) !== -1) {
      tokens.push({ type: 'op', value: expr[i] });
      i++;
      continue;
    }
    if ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.') {
      var num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i]; i++;
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }
    if ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z')) {
      var name = '';
      while (i < expr.length && ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= '0' && expr[i] <= '9'))) {
        name += expr[i]; i++;
      }
      if (CONSTANTS.hasOwnProperty(name)) {
        tokens.push({ type: 'num', value: CONSTANTS[name] });
      } else if (FUNCTIONS.hasOwnProperty(name)) {
        tokens.push({ type: 'func', value: name });
      } else {
        throw new Error('Unknown identifier: ' + name);
      }
      continue;
    }
    throw new Error('Unexpected character: ' + expr[i]);
  }
  return tokens;
}

function shuntingYard(tokens) {
  var output = [];
  var ops = [];

  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];

    if (tok.type === 'num') {
      output.push(tok);
    } else if (tok.type === 'func') {
      ops.push(tok);
    } else if (tok.value === '(') {
      ops.push(tok);
    } else if (tok.value === ')') {
      while (ops.length > 0 && ops[ops.length - 1].value !== '(') {
        output.push(ops.pop());
      }
      if (ops.length === 0) throw new Error('Mismatched parentheses');
      ops.pop();
      if (ops.length > 0 && ops[ops.length - 1].type === 'func') {
        output.push(ops.pop());
      }
    } else if (tok.type === 'op') {
      if ((tok.value === '-' || tok.value === '+') &&
          (i === 0 || tokens[i - 1].type === 'op' || tokens[i - 1].value === '(')) {
        if (tok.value === '-') {
          output.push({ type: 'num', value: -1 });
          ops.push({ type: 'op', value: '*' });
        }
      } else {
        while (ops.length > 0 && ops[ops.length - 1].value !== '(' &&
               ops[ops.length - 1].type !== 'func' &&
               PRECEDENCE[ops[ops.length - 1].value] >= PRECEDENCE[tok.value] &&
               ops[ops.length - 1].value !== '^') {
          output.push(ops.pop());
        }
        ops.push(tok);
      }
    }
  }

  while (ops.length > 0) {
    var op = ops.pop();
    if (op.value === '(' || op.value === ')') throw new Error('Mismatched parentheses');
    output.push(op);
  }

  return output;
}

function evaluatePostfix(tokens) {
  var stack = [];

  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];

    if (tok.type === 'num') {
      stack.push(tok.value);
    } else if (tok.type === 'func') {
      var arg = stack.pop();
      if (arg === undefined) throw new Error('Not enough arguments for ' + tok.value);
      stack.push(FUNCTIONS[tok.value](arg));
    } else if (tok.type === 'op') {
      var right = stack.pop();
      var left = stack.pop();
      if (left === undefined || right === undefined) {
        throw new Error('Not enough operands');
      }
      switch (tok.value) {
        case '+': stack.push(left + right); break;
        case '-': stack.push(left - right); break;
        case '*': stack.push(left * right); break;
        case '/': stack.push(left / right); break;
        case '%': stack.push(left % right); break;
        case '^': stack.push(Math.pow(left, right)); break;
      }
    }
  }

  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}

function evaluate(expr) {
  var tokens = tokenize(expr);
  var postfix = shuntingYard(tokens);
  return evaluatePostfix(postfix);
}
