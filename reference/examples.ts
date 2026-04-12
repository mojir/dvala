import { dvala } from './dvala'

export const EXAMPLE_DESCRIPTION_MAX_LENGTH = 120

export interface Example {
  id: string
  name: string
  description: string
  category: string
  code: string
  effectHandlers?: { pattern: string; handler: string }[]
}

export const examples: Example[] = [
  {
    id: 'collection-accessor',
    name: 'Collection accessors',
    description: 'Syntactic sugar for accessing object, array and string elements.',
    category: 'Basics',
    code: dvala`
// Access object properies with .
// Access string and array elements with []

let data = {
  numbers: [1, 2, 3],
  chars: ["a", "b", "c"],
  string: "Albert"
};

perform(@dvala.io.print, data.numbers[0]);
perform(@dvala.io.print, data.chars[2]);
perform(@dvala.io.print, data.string[0]);

perform(@dvala.io.print, {a: 1, b: 2, c: 3}.b);
perform(@dvala.io.print, "Albert"[3]);
perform(@dvala.io.print, [1, 2, 3][2]);`,
  },
  {
    id: 'atoms-and-tagged-results',
    name: 'Atoms and tagged results',
    description: 'Atoms are self-evaluating named constants starting with :. Tags for result handling, as used by settled().',
    category: 'Basics',
    code: dvala`
// Atoms are lightweight tags
let status = :ok;
perform(@dvala.io.print, status);
perform(@dvala.io.print, typeOf(status));

// Tagged results — a common pattern
let results = [[:ok, 42], [:error, "not found"], [:ok, 99]];

for(result in results) -> match result
  case [:ok, value] then perform(@dvala.io.print, \`Success: \${value}\`)
  case [:error, msg] then perform(@dvala.io.print, \`Error: \${msg}\`)
end;

// Atoms are structurally equal
perform(@dvala.io.print, :ok == :ok);
perform(@dvala.io.print, :ok == :error);`,
  },
  {
    id: 'template-strings',
    name: 'Template strings',
    description: 'Template strings use backticks and support ${...} interpolation for embedding expressions directly in strings.',
    category: 'Basics',
    code: dvala`
// Template strings embed expressions with \${...}
let name = "Alice";
let score = 42;

perform(@dvala.io.print, \`Hello, \${name}!\`);
perform(@dvala.io.print, \`Score: \${score}/100\`);

// Any expression works inside \${...}
let items = ["apple", "banana", "cherry"];
for (i in range(count(items))) ->
  perform(@dvala.io.print, \`\${i + 1}. \${items[i]}\`)`,
  },
  {
    id: 'simple-context-example',
    name: 'Using context',
    description: 'Simple example using a host effect handler to perform addition in JavaScript.',
    category: 'Effects & Context',
    effectHandlers: [
      { pattern: 'host.plus', handler: 'async ({ arg: [a, b], resume }) => { resume(a + b) }' },
    ],
    code: dvala`
perform(@host.plus, [15, 27])`,
  },
  {
    id: 'async-example',
    name: 'Async host effects',
    description: 'Demonstrates calling async JavaScript from Dvala via effect handlers.',
    category: 'Effects & Context',
    effectHandlers: [
      { pattern: 'host.fetchUser', handler: `async ({ arg: id, resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users/' + id);
    const user = await response.json();
    resume({ name: user.name, email: user.email, city: user.address.city });
  } catch(e) { fail(e.message) }
}` },
      { pattern: 'host.fetchPosts', handler: `async ({ arg: userId, resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?userId=' + userId);
    const posts = await response.json();
    resume(posts.slice(0, 3).map(p => ({ title: p.title, body: p.body })));
  } catch(e) { fail(e.message) }
}` },
      { pattern: 'host.delay', handler: `async ({ arg: ms, resume }) => {
  await new Promise(resolve => setTimeout(resolve, ms));
  resume(ms);
}` },
    ],
    code: dvala`
// Call async host effects with perform(effect, args...)

// Simulate a delay
perform(@dvala.io.print, "Waiting 500ms...");
perform(@host.delay, 500);
perform(@dvala.io.print, "Done waiting!");

// Fetch a user from a REST API
let user = perform(@host.fetchUser, 1);
perform(@dvala.io.print, "User: " ++ user.name);
perform(@dvala.io.print, "Email: " ++ user.email);
perform(@dvala.io.print, "City: " ++ user.city);

// Fetch their posts
let posts = perform(@host.fetchPosts, 1);
perform(@dvala.io.print, "\\nFirst " ++ str(count(posts)) ++ " posts by " ++ user.name ++ ":");
for (post in posts) -> perform(@dvala.io.print, "- " ++ post.title);`,
  },
  {
    id: 'async-interactive',
    name: 'Interactive async',
    description: 'A more complex async example with user interactions. Uses prompt for input and fetch for API calls.',
    category: 'Effects & Context',
    effectHandlers: [
      { pattern: 'host.fetchUser', handler: `async ({ arg: id, resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users/' + id);
    if (!response.ok) { resume(null); return; }
    const user = await response.json();
    resume({ id: user.id, name: user.name, email: user.email, city: user.address.city, company: user.company.name });
  } catch(e) { fail(e.message) }
}` },
      { pattern: 'host.fetchTodos', handler: `async ({ arg: userId, resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/todos?userId=' + userId);
    const todos = await response.json();
    resume(todos.map(t => ({ title: t.title, completed: t.completed })));
  } catch(e) { fail(e.message) }
}` },
    ],
    code: dvala`
// Interactive async example
// Uses dvala.io.read for user input and host.fetch-* for API calls

let lookupUser = (idStr) -> do
  let id = number(idStr);
  if not(isNumber(id)) || id < 1 || id > 10 then
    perform(@dvala.io.print, "Invalid user ID: " ++ idStr ++ ". Please enter 1-10.");
  else
    perform(@dvala.io.print, "Fetching user " ++ str(id) ++ "...");
    let user = perform(@host.fetchUser, id);
    if isNull(user) then
      perform(@dvala.io.print, "User not found.");
    else
      perform(@dvala.io.print, "Name:    " ++ user.name);
      perform(@dvala.io.print, "Email:   " ++ user.email);
      perform(@dvala.io.print, "City:    " ++ user.city);
      perform(@dvala.io.print, "Company: " ++ user.company);
      user;
    end
  end
end;

let showTodos = (user) -> do
  perform(@dvala.io.print, "\\nFetching todos for " ++ user.name ++ "...");
  let todos = perform(@host.fetchTodos, user.id);
  let done = filter(todos, -> $.completed);
  let pending = filter(todos, -> not($.completed));

  perform(@dvala.io.print, "\\nCompleted (" ++ str(count(done)) ++ "/" ++ str(count(todos)) ++ "):");
  for (t in done take 5) -> perform(@dvala.io.print, "  ✓ " ++ t.title);
  if count(done) > 5 then
    perform(@dvala.io.print, "  ... and " ++ str(count(done) - 5) ++ " more")
  else null end;

  perform(@dvala.io.print, "\\nPending (" ++ str(count(pending)) ++ "):");
  for (t in pending take 5) -> perform(@dvala.io.print, "  ○ " ++ t.title);
  if count(pending) > 5 then
    perform(@dvala.io.print, "  ... and " ++ str(count(pending) - 5) ++ " more")
  else null end
end;

// Main interaction loop
let main = () -> do
  perform(@dvala.io.print, "=== User Lookup Tool ===\\n");

  loop (cont = true) ->
    if cont then
      let input = perform(@dvala.io.read, "Enter a user ID (1-10), or cancel to quit:");
      if isNull(input) || input == "" then
        perform(@dvala.io.print, "Goodbye!");
      else
        let user = lookupUser(input);
        if user then
          let show = perform(@dvala.io.read, "Show todos for " ++ user.name ++ "? (yes/no)");
          if show == "yes" then showTodos(user) else null end;
        else null end;
        perform(@dvala.io.print, "");
        recur(true)
      end

    else null end
end;

main()`,
  },
  {
    id: 'text-based-game',
    name: 'A game',
    description: 'Text based adventure game.',
    category: 'Projects',
    code: dvala`
// Functional Text Adventure Game in Dvala

// Define locations
let locations = {
  forest: {
    description: "You are in a dense forest. Light filters through the leaves above.",
    exits: { north: "cave", east: "river", south: "meadow" }
  },
  cave: {
    description: "You stand in a dark cave. Water drips from stalactites overhead.",
    exits: { south: "forest", east: "tunnel" },
    items: ["torch"]
  },
  river: {
    description: "A swift river flows from the mountains. The water is crystal clear.",
    exits: { west: "forest", north: "waterfall" },
    items: ["fishing rod"]
  },
  meadow: {
    description: "A peaceful meadow stretches before you, filled with wildflowers.",
    exits: { north: "forest", east: "cottage" },
    items: ["flowers"]
  },
  waterfall: {
    description: "A magnificent waterfall cascades down from high cliffs.",
    exits: { south: "river" },
    items: ["shiny stone"]
  },
  tunnel: {
    description: "A narrow tunnel leads deeper into the mountain.",
    exits: { west: "cave", east: "treasure room" }
  },
  "treasure room": {
    description: "A small chamber glittering with treasure!",
    exits: { west: "tunnel" },
    items: ["gold key", "ancient map", "jeweled crown"]
  },
  cottage: {
    description: "A cozy cottage with a smoking chimney stands here.",
    exits: { west: "meadow" },
    items: ["bread"]
  }
};

// Define game state
let initialState = {
  currentLocation: "forest",
  inventory: [],
  visited: {},
  gameOver: false,
  moves: 0,
  lightSource: false
};

// Helper functions
let isHasItem = (state, item) -> do
  contains(state.inventory, item);
end;

let isLocationHasItem = (location, item) -> do
  contains(get(location, "items", []), item);
end;

let describeLocation = (state) -> do
  let location = get(locations, state.currentLocation);
  let description = location.description;

  // Add visited status
  let visitedStatus = if get(state.visited, state.currentLocation, 0) > 1 then
    "You've been here before."
  else
    "This is your first time here."
  end;

  // Check if location has items
  let itemsDesc = if not(isEmpty(get(location, "items", []))) then
    "You see: " ++ join(location.items, ", ")
  else
    ""
  end;

  // Describe exits
  let exits = keys(location.exits) join ", ";
  let exitsDesc = "Exits: " ++ exits;

  // Join all descriptions
  filter([description, visitedStatus, itemsDesc, exitsDesc], -> not(isEmpty($))) join "\\n"
end;

let getLocationItems = (state) -> do
  let location = get(locations, state.currentLocation);
  get(location, "items", [])
end;

// Game actions
let move = (state, direction) -> do
  let location = get(locations, state.currentLocation);
  let exits = get(location, "exits", {});

  // Check if direction is valid
  if contains(exits, direction) then
    let newLocation = get(exits, direction);
    let isDark = newLocation == "tunnel" || newLocation == "treasure room";

    // Check if player has light source for dark areas
    if isDark && not(state.lightSource) then
      [state, "It's too dark to go that way without a light source."]
    else
      let newVisited = assoc(
        state.visited,
        newLocation,
        inc(state.visited["newLocation"] ?? 0)
      );
      let newState = assoc(
        assoc(
          assoc(state, "currentLocation", newLocation),
          "visited",
          newVisited
        ),
        "moves",
        state.moves + 1
      );

      [newState, "You move " ++ direction ++ " to the " ++ newLocation ++ "."]
    end
  else
    [state, "You can't go that way."]
  end
end;

let takeFn = (state, item) -> do
  let items = getLocationItems(state);

  if contains(items, item) then
    let location = get(locations, state.currentLocation);
    let newLocationItems = filter(items, -> $ != item);
    let newInventory = push(state.inventory, item);

    // Update game state
    let newLocations = assoc(
      locations, 
      state.currentLocation,
      assoc(location, "items", newLocationItems)
    );

    // Special case for torch
    let hasLight = item == "torch" || state.lightSource;

    // Update locations and state
    let locations = newLocations;
    let newState = assoc(
      assoc(
        assoc(state, "inventory", newInventory),
        "lightSource", hasLight
      ),
      "moves",
      state.moves + 1
    );
    [newState, "You take the " ++ item ++ "."]
  else
    [state, "There is no " ++ item ++ " here."]
  end
end;

let dropFn = (state, item) -> do
  if isHasItem(state, item) then
    let location = get(locations, state.currentLocation);
    let locationItems = get(location, "items", []);
    let newLocationItems = push(locationItems, item);
    let newInventory = filter(-> $ != item, state.inventory);

    // Special case for torch
    let stillHasLight = not(item == "torch") || contains(newInventory, "torch");

    // Update locations and state
    let newLocation = assoc(location, "items", newLocationItems);
    let locations = assoc(locations, state.currentLocation, newLocation);

    let newState = assoc(
      assoc(
        assoc(
          state, "inventory", newInventory),
          "lightSource",
          stillHasLight
        ),
        "moves",
        state.moves + 1
      );
    [newState, "You drop the " ++ item ++ "."]
  else
    [state, "You don't have a " ++ item ++ " in your inventory."]
  end
end;

let inventory = (state) -> do
  if isEmpty(state.inventory) then
    [state, "Your inventory is empty."]
  else
    [state, "Inventory: " ++ join(state.inventory, ", ")]
  end
end;

let use = (state, item) -> do
  match item
    case "fishing rod" then
      if state.currentLocation == "river" then
        [assoc(state, "moves", state.moves + 1), "You catch a small fish, but it slips away."]
      else
        [state, "There's no place to use a fishing rod here."]
      end
    case "torch" then
      if isHasItem(state, item) then
        [
          assoc(assoc(state, "lightSource", true), "moves", state.moves + 1),
          "The torch illuminates the area with a warm glow."
        ]
      else
        [state, "You don't have a torch."]
      end
    case "gold key" then
      if isHasItem(state, item) && state.currentLocation == "treasure room" then
        [
          assoc(
            assoc(state, "gameOver", true),
            "moves",
            state.moves + 1
          ),
         "You use the gold key to unlock a secret compartment, revealing a fabulous diamond! You win!"
        ]
      else
        [state, "The key doesn't fit anything here."]
      end
    case "bread" then
      if isHasItem(state, item) then
        let newInventory = filter(state.inventory, -> $ != item);
        [
          assoc(
            assoc(state, "inventory", newInventory),
            "moves",
            state.moves + 1
          ),
          "You eat the bread. It's delicious and nourishing."
        ]
      else
        [state, "You don't have any bread."]
      end
    case "shiny stone" then
      if isHasItem(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "The stone glows with a faint blue light. It seems magical but you're not sure how to use it yet."
        ]
      else
        [state, "You don't have a shiny stone."]
      end
    case "flowers" then
      if isHasItem(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "You smell the flowers. They have a sweet, calming fragrance."
        ]
      else
        [state, "You don't have any flowers."]
      end
    case "ancient map" then
      if isHasItem(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "The map shows the layout of the area. All locations are now marked as visited."
        ]
      else
        [state, "You don't have a map."]
      end
    case "jeweled crown" then
      if isHasItem(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "You place the crown on your head. You feel very regal."
        ]
      else
        [state, "You don't have a crown."]
      end
  end ?? [state, "You can't use that."]
end;

// Command parser
let parseCommand = (state, input) -> do
  let tokens = lowerCase(input) split " ";
  let command = first(tokens);
  let args = rest(tokens) join " ";

  let result = match command
    case "go" then
      move(state, args)
    case "north" then
      move(state, "north")
    case "south" then
      move(state, "south")
    case "east" then
      move(state, "east")
    case "west" then
      move(state, "west")
    case "take" then
      takeFn(state, args)
    case "drop" then
      dropFn(state, args)
    case "inventory" then
      inventory(state)
    case "i" then
      inventory(state)
    case "look" then
      [assoc(state, "moves", state.moves + 1), describeLocation(state)]
    case "use" then
      use(state, args)
    case "help" then
      [state, "Commands then go [direction], north, south, east, west, take [item], drop [item], inventory, look, use [item], help, quit"]
    case "quit" then
      [assoc(state, "gameOver", true), "Thanks for playing!"]
  end ?? [state, "I don't understand that command. Type 'help' for a list of commands."];

  result
end;

// Game loop
let gameLoop = (state) -> do
  let input = perform(@dvala.io.read, describeLocation(state) ++ "\\nWhat do you do? ");
  let command_result = parseCommand(state, input);
  let newState = first(command_result);
  let message = second(command_result);

  perform(@dvala.io.print, "\\n" ++ message ++ "\\n");

  if newState.gameOver then
    perform(@dvala.io.print, "\\nGame over! You made " ++ str(newState.moves) ++ " moves.");
    newState
  else
    gameLoop(newState)
  end
end;

// Start game
let startGame = () -> do
  perform(@dvala.io.print, "=== Dvala Adventure Game ===\\n" ++ "Type 'help' for a list of commands.\\n\\n");
  gameLoop(initialState)
end;

// Call the function to start the game
startGame()    `,
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    description: 'Fibonacci with self-recursion and tail-recursive loop/recur.',
    category: 'Basics',
    code: dvala`
// Recursive — simple but exponential time, blows the stack for large n
let fib = (n) ->
  if n <= 1 then n
  else self(n - 1) + self(n - 2)
  end;

// Tail-recursive — loop/recur reuses the current frame, O(n) time
let fibTCO = (n) ->
  loop (i = n, a = 0, b = 1) ->
    if i <= 0 then a
    else recur(i - 1, b, a + b)
    end;

perform(@dvala.io.print, "recursive  fib(10) = " ++ str(fib(10)));
perform(@dvala.io.print, "tail-rec   fib(10) = " ++ str(fibTCO(10)));
perform(@dvala.io.print, "tail-rec   fib(50) = " ++ str(fibTCO(50)));
perform(@dvala.io.print, "tail-rec   fib(90) = " ++ str(fibTCO(90)))`,

  },
  {
    id: 'sort',
    name: 'Sort',
    description: 'Sort an array of numbers.',
    category: 'Basics',
    code: dvala`
let l = [7, 39, 45, 0, 23, 1, 50, 100, 12, -5];
let numberComparer = (a, b) -> do
  if a < b then -1
  else if a > b then 1
  else 0
  end
end;

sort(l, numberComparer)`,
  },
  {
    id: 'fizzbuzz',
    name: 'FizzBuzz',
    description: 'The classic FizzBuzz challenge using a for comprehension with let bindings and if/else if.',
    category: 'Basics',
    code: dvala`
// FizzBuzz: print numbers 1 to 30, but
//   multiples of 3 → "Fizz"
//   multiples of 5 → "Buzz"
//   multiples of both → "FizzBuzz"

let fizzbuzz = for (
  n in range(1, 31)
  let div3 = isZero(n mod 3)
  let div5 = isZero(n mod 5)
) -> if div3 && div5 then "FizzBuzz"
  else if div3 then "Fizz"
  else if div5 then "Buzz"
  else str(n)
end;

fizzbuzz join ", "`,
  },
  {
    id: 'host-values',
    name: 'Host values',
    description: 'Request values from the host using @dvala.host. The host provides an effect handler with the values.',
    category: 'Effects & Context',
    effectHandlers: [
      { pattern: 'dvala.host', handler: '({ arg, resume, fail }) => { const values = { greeting: "Hello from the host!", version: 42 }; if (arg in values) resume(values[arg]); else fail("Unknown: " + arg) }' },
    ],
    code: dvala`
let greeting = perform(@dvala.host, "greeting");
let version = perform(@dvala.host, "version");
perform(@dvala.io.print, greeting);
\`Dvala version: \${version}\``,
  },
  {
    id: 'env-variables',
    name: 'Environment variables',
    description: 'Read environment variables with @dvala.env. Returns null for unset variables — use ?? for defaults.',
    category: 'Effects & Context',
    code: dvala`
// Read an environment variable (returns null if not set)
let home = perform(@dvala.env, "HOME") ?? "(not set)";
let editor = perform(@dvala.env, "EDITOR") ?? "nano";
let missing = perform(@dvala.env, "DVALA_NONEXISTENT_VAR") ?? "default";

perform(@dvala.io.print, \`HOME: \${home}\`);
perform(@dvala.io.print, \`EDITOR: \${editor}\`);
perform(@dvala.io.print, \`Missing: \${missing}\`);

{ home, editor, missing }`,
  },
  {
    id: 'cli-arguments',
    name: 'CLI arguments',
    description: 'Read command-line arguments with @dvala.args. Returns an array of strings (node and script path are stripped).',
    category: 'Effects & Context',
    code: dvala`
// Get CLI arguments (empty array in the playground)
let args = perform(@dvala.args);
let argCount = count(args);

if argCount == 0 then
  "No arguments (try: dvala run 'perform(@dvala.args)' -- a b c)"
else
  \`Got \${argCount} arguments: \${join(args, ", ")}\`
end`,
  },
  {
    id: 'playground-demo',
    name: 'Playground Effects Demo',
    description: 'Showcases playground.* effects — Dvala code that controls the playground UI. Load this in the playground and press Run.',
    category: 'Effects & Context',
    code: dvala`
// Playground Effects Demo
// This program uses playground.* effects to control the UI.
// It only works when run inside the playground.

// 1. Show a greeting toast
perform(@playground.ui.showToast, ["Welcome to Playground Effects!", "success"]);

// 2. Read the current editor content
let original = perform(@playground.editor.getContent);
perform(@dvala.io.print, "Editor has " ++ str(count(original)) ++ " characters");

// 3. Generate some code and write it to the editor
let n = 5;
let generated = "let total = " ++ join(for (i in range(1, n + 1)) -> str(i), " + ") ++ "; total";
perform(@playground.editor.setContent, generated);
perform(@playground.ui.showToast, ["Code generated!", "info"]);

// 4. Wait a moment, then restore the original
perform(@dvala.sleep, 1500);
perform(@playground.editor.setContent, original);
perform(@playground.ui.showToast, ["Original restored!", "success"]);

"Done!"`,
  },
  {
    id: 'macros-intro',
    name: 'Macros — Introduction',
    description: 'Macros receive AST (unevaluated code) and return new AST. Quote...end blocks make AST construction ergonomic.',
    category: 'Macros',
    code: dvala`
// A macro receives its arguments as AST — not evaluated values.
// It returns new AST which is then evaluated in the caller's scope.

// Identity macro — returns the AST unchanged
let id = macro (ast) -> ast;
perform(@dvala.io.print, id(1 + 2));  // 3

// Double macro — duplicates an expression using a quote...end block
// quote...end creates AST at parse time, $^{...} splices values in
let double = macro (ast) -> quote $^{ast} + $^{ast} end;
perform(@dvala.io.print, double(21));       // 42
perform(@dvala.io.print, double(inc(5)));   // 12

// unless — a custom control flow macro
let unless = macro (cond, body) ->
  quote if not($^{cond}) then $^{body} else null end end;

perform(@dvala.io.print, unless(false, "runs!"));   // "runs!"
perform(@dvala.io.print, unless(true, "skipped"));  // null

// Macros work with |> pipe
let negate = macro (ast) -> quote 0 - $^{ast} end;
perform(@dvala.io.print, 21 |> double |> negate);   // -42`,
  },
  {
    id: 'macros-advanced',
    name: 'Macros — Advanced',
    description: 'macroexpand for debugging, hygiene (auto-gensym), and the ast module for programmatic inspection.',
    category: 'Macros',
    code: dvala`
let { prettyPrint } = import("ast");

// --- macroexpand — inspect without evaluating ---
let double = macro (ast) -> quote $^{ast} + $^{ast} end;

perform(@dvala.io.print, "Type: " ++ typeOf(double));
perform(@dvala.io.print, "Is macro: " ++ str(isMacro(double)));

let expanded = macroexpand(double, quote x + 1 end);
perform(@dvala.io.print, "Expanded AST: " ++ prettyPrint(expanded));

// --- Hygiene — macro bindings don't collide with caller ---
let withTemp = macro (ast) -> quote do
  let result = $^{ast};
  result * 2
end end;

let result = 999;                    // caller's "result"
let doubled = withTemp(result + 1);  // macro's "result" is gensymed
perform(@dvala.io.print, "doubled: " ++ str(doubled));   // 2000
perform(@dvala.io.print, "result: " ++ str(result));     // 999 (not clobbered)`,
  },
  {
    id: 'macro-inception',
    name: 'Macro Inception',
    description: 'Macros that generate other macros — $^^{} escapes two quote levels for nested code generation.',
    category: 'Macros',
    // Formatter can't handle nested $^^{} double-escape splices — use raw string.
    code: `
// === Macro Inception — macros that write macros ===
// Dvala's nested quote...end with $^^{} is analogous to
// Clojure's nested \`(defmacro ... \`(~~ ...))\` pattern.

// --- 1. Operator factory ---
// Clojure: (defmacro def-binop [op]
//            \`(defmacro ~(gensym) [a# b#] \`(~'~op ~~a# ~~b#)))
//
// A macro that creates binary-operator macros.
// $^^{op} escapes two levels: captured by outer quote,
// injected into inner quote's expansion.
let makeBinOp = macro (op) ->
  quote
    macro (a, b) -> quote $^{a} $^^{op} $^{b} end
  end;

let myAdd = makeBinOp(+);
let myMul = makeBinOp(*);
perform(@dvala.io.print, "myAdd(3, 4) = " ++ str(myAdd(3, 4)));
perform(@dvala.io.print, "myMul(3, 4) = " ++ str(myMul(3, 4)));

// --- 2. Safe-wrapper factory ---
// Clojure: (defmacro def-safe [fallback]
//            \`(defmacro ~(gensym) [body#]
//               \`(try ~~body# (catch Exception e# ~'~fallback))))
//
// A macro that creates error-catching macros,
// each with a different fallback value baked in.
let { fallback } = import("effectHandler");
let makeSafe = macro (fallbackVal) ->
  quote
    macro (ast) -> quote fallback($^^{fallbackVal})(-> $^{ast}) end
  end;

let safeMath = makeSafe(0);
let safeBool = makeSafe(false);
perform(@dvala.io.print, "safeMath(0 / 0) = " ++ str(safeMath(0 / 0)));
perform(@dvala.io.print, "safeMath(10 / 2) = " ++ str(safeMath(10 / 2)));
perform(@dvala.io.print, "safeBool(1 > null) = " ++ str(safeBool(1 > null)));

// --- 3. Function-to-macro lifter ---
// Clojure: (defmacro def-applier [f]
//            \`(defmacro ~(gensym) [x#] \`(~'~f ~~x#)))
//
// Wraps any function as a macro — the function is captured
// at the outer level and called inside the inner expansion.
let makeApplier = macro (fn) ->
  quote
    macro (ast) -> quote $^^{fn}($^{ast}) end
  end;

let doubleIt = makeApplier((x) -> x * 2);
let stringify = makeApplier(str);
perform(@dvala.io.print, "doubleIt(21) = " ++ str(doubleIt(21)));
perform(@dvala.io.print, "stringify(1 + 2) = " ++ stringify(1 + 2))`.trim(),
  },
  {
    id: 'ast-coverage',
    name: 'AST node coverage',
    description: 'Exercises all special expressions, operators, destructuring, effects, and node types.',
    category: 'Test Fixtures',
    code: dvala`
// === AST Node Coverage ===
// Covers: all special expressions, key operators, effects, destructuring, spreading

// --- Primitives: Number, String, Reserved ---
let num = 42;
let str1 = "hello";
let flag = true;
let nothing = null;

// --- Template strings ---
let greeting = \`\${str1} world #\${num}\`;

// --- Operators: arithmetic, comparison, logical, bitwise ---
let math1 = (10 + 3) * 2 - 1 / 2 ^ 2;
let modResult = 17 % 5;
let concatResult = "a" ++ "b" ++ "c";
let cmp = [1 < 2, 2 > 1, 3 <= 3, 4 >= 4, 5 == 5, 6 != 7];
let logic = [true && false, true || false, null ?? "default"];
let bits = [(5 & 3), (5 | 3), (5 xor 3), (1 << 3), (16 >> 2), (16 >>> 2)];

// --- Pipe operator ---
let piped = 5 |> inc |> (x -> x * 2);

// --- Array and Object literals ---
let arr = [1, 2, 3];
let obj = { a: 1, b: "two", c: [3] };

// --- Spread ---
let arr2 = [0, ...arr, 4];
let obj2 = { ...obj, d: 4 };

// --- Destructuring: array with rest ---
let [dx, dy, ...dzs] = [10, 20, 30, 40];

// --- Destructuring: object ---
let { a, b, c } = obj;

// --- Destructuring: object with alias ---
let { a as aVal } = obj;

// --- Destructuring: nested ---
let nested = { user: { name: "Alice", scores: [95, 87] } };
let { user: { name, scores: [firstScore, ...restScores] } } = nested;

// --- Destructuring: default value ---
let [dp = 0, dq = 99] = [7];

// --- Block (do...end) ---
let blockResult = do
  let tmp = 10;
  tmp + 1
end;

// --- If / else if / else ---
let grade = if num > 90 then "A"
  else if num > 80 then "B"
  else if num > 40 then "C"
  else "F"
end;

// --- Function (lambda) ---
let myAdd = (a, b) -> a + b;
let myDouble = (n) -> n * 2;

// --- Function with body block ---
let factorial = (n) -> do
  if n <= 1 then 1
  else n * self(n - 1)
  end
end;

// --- Loop with recur ---
let loopSum = loop (i = 0, acc = 0) ->
  if i >= 10 then acc
  else recur(i + 1, acc + i)
  end;

// --- For comprehension with let, when ---
let fizz = for (
  n in range(1, 16)
  let div3 = isZero(n % 3)
  let div5 = isZero(n % 5)
  when div3 || div5
) -> if div3 && div5 then "FizzBuzz"
  else if div3 then "Fizz"
  else "Buzz"
end;

// --- Match with literal patterns ---
let describe = (val) -> match val
  case 0 then "zero"
  case 1 then "one"
  case _ then "other"
end;

// --- Match with guard ---
let classify = (n) -> match n
  case x when x < 0 then "negative"
  case 0 then "zero"
  case x then "positive"
end;

// --- Match with destructuring ---
let getShape = (point) -> match point
  case { x, y } then \`(\${x}, \${y})\`
  case [a, b] then \`[\${a}, \${b}]\`
  case _ then "unknown"
end;

// --- Effect name ---
let eff = @dvala.io.pick;

// --- Effect handling: handler...end with do...with ---
let { fallback } = import("effectHandler");
let handled = do
  with fallback("Green");
  let color = perform(@dvala.io.pick, ["Red", "Green", "Blue"]);
  color ++ " was chosen"
end;

// --- Handler as function ---
let piped2 = fallback(1)(-> perform(@dvala.io.pick, [1, 2, 3]));

// --- Import ---
let mathMod = import("math");

// --- Regexp shorthand ---
let reResult = "hello-world" reMatch #"(\\w+)-(\\w+)";

// --- Unary minus ---
let neg = -num;

// --- Collect all results as array ---
[
  num, str1, flag, nothing, greeting, math1, modResult, concatResult,
  cmp, logic, bits, piped,
  arr, obj, arr2, obj2,
  dx, dy, dzs, a, b, c, aVal,
  name, firstScore, restScores, dp, dq,
  blockResult, grade,
  myAdd(1, 2), myDouble(5), factorial(5),
  loopSum, fizz,
  describe(0), describe(1), describe(99),
  classify(-5), classify(0), classify(7),
  getShape({ x: 1, y: 2 }), getShape([3, 4]), getShape("?"),
  handled, piped2,
  mathMod.sin(0), mathMod.cos(0),
  reResult, neg
]`,
  },
  {
    id: 'macro-toolkit',
    name: 'Macro toolkit',
    description: 'A reusable toolkit: unless, dbg, assert, thread, tryOr — code generation, AST inspection, and macroexpand.',
    category: 'Macros',
    effectHandlers: [
      { pattern: 'dvala.io.print', handler: '({ arg, resume }) => { resume(arg) }' },
    ],
    code: dvala`
// ============================================================
// Macro Toolkit — a practical collection of utility macros
// ============================================================
// This example builds a reusable macro toolkit step by step,
// showing how macros can generate code, inspect AST, enforce
// contracts, and create new control flow constructs.

let { prettyPrint, call } = import("ast");
let { fallback } = import("effectHandler");
let print = -> perform(@dvala.io.print, $);
let error = -> perform(@dvala.error, { message: $ });


// ─── 1. unless ──────────────────────────────────────────────
// The inverse of \`if\`: runs the body when the condition is *false*.
// A classic first macro — one line of quote...end block does it all.

let unless = macro (cond, body) ->
  quote if not($^{cond}) then $^{body} else null end end;

print("── unless ──");
print(unless(false, "condition was false → ran!"));
print(unless(true, "condition was true → skipped"));


// ─── 2. dbg — debug-print with source label ────────────────
// Prints "<source> => <value>" and returns the value unchanged.
// Uses prettyPrint to convert the unevaluated AST back to source.
// Invaluable for tracing expressions without altering control flow.

let dbg = macro (ast) -> do
  let label = prettyPrint(ast);
  quote do
    let val = $^{ast};
    perform(@dvala.io.print, $^{["Str", label ++ " => ", 0]} ++ str(val));
    val
  end end
end;

print("── dbg ──");
let x = dbg(3 + 4);
dbg(x * 2);
dbg(map([1, 2, 3], -> $ ^ 2));


// ─── 3. assert and assertEq — test assertions ──────────────
// assert(cond) — fails with the source expression on false
// assertEq(actual, expected) — fails with both values on mismatch
//
// The macros capture the source text at compile time via prettyPrint,
// so error messages are automatically descriptive.

let assert = macro (cond) -> do
  let src = prettyPrint(cond);
  quote do
    let v = $^{cond};
    if not(v) then
      error("Assertion failed: " ++ $^{["Str", src, 0]})
    else
      true
    end
  end end
end;

let assertEq = macro (actual, expected) -> do
  let actualSrc = prettyPrint(actual);
  quote do
    let a = $^{actual};
    let e = $^{expected};
    if a != e then
      error(
        "Assertion failed: " ++ $^{["Str", actualSrc, 0]}
        ++ " — expected " ++ str(e)
        ++ ", got " ++ str(a)
      )
    else
      true
    end
  end end
end;

print("── assert / assertEq ──");
assert(10 > 5);
assert(isEven(42));
assertEq(2 + 2, 4);
assertEq("hello" ++ " world", "hello world");
assertEq(map([1, 2, 3], -> $ * 10), [10, 20, 30]);
print("all assertions passed!");


// ─── 4. thread — pipe a value through functions ─────────────
// thread(value, f1, f2, f3) becomes f3(f2(f1(value)))
// Builds the nested call AST at compile time by folding over
// the function arguments. A classic Lisp/Clojure threading macro.

let thread = macro (val, ...fns) -> do
  reduce(fns, (acc, f) -> call(f, [acc]), val)
end;

print("── thread ──");
// thread(-42, abs, str, count) → count(str(abs(-42))) → 2
print(thread(-42, abs, str, count));
// thread with collection pipeline
print(thread(
  [3, 1, 4, 1, 5, 9],
  sort,
  reverse,
  count
));


// ─── 5. tryOr — error recovery macro ────────────────────────
// Wraps an expression with a handler that catches errors
// and returns a fallback value. Uses fallback(v)(-> body).

let tryOr = macro (expr, defaultVal) ->
  quote fallback($^{defaultVal})(-> $^{expr}) end;

print("── tryOr ──");
print(tryOr(10 / 2, -1));
print(tryOr(0 / 0, -1));
print(tryOr(error("boom"), "recovered"));


// ─── 6. macroexpand — inspecting generated code ─────────────
// macroexpand calls a macro's body and returns the expanded AST
// without evaluating it. Combined with prettyPrint from the ast
// module, this lets you see exactly what code a macro generates.

print("── macroexpand ──");
print("unless(x > 0, 42) expands to:");
print("  " ++ (macroexpand(unless, quote x > 0 end, quote 42 end) |> prettyPrint));

print("dbg(x + 1) expands to:");
print("  " ++ (macroexpand(dbg, quote x + 1 end) |> prettyPrint));

print("thread(v, f, g) expands to:");
print("  " ++ (macroexpand(thread, quote v end, quote f end, quote g end) |> prettyPrint));


// ─── 7. Putting it all together ─────────────────────────────
// Use the toolkit to build and verify a small utility with confidence.

print("── integration demo ──");

// A function that computes a letter grade from a percentage score
let letterGrade = (pct) ->
  if pct >= 90 then "A"
  else if pct >= 80 then "B"
  else if pct >= 70 then "C"
  else if pct >= 60 then "D"
  else "F"
  end;

// Verify with assertEq — if any fail, we get a clear error message
assertEq(letterGrade(95), "A");
assertEq(letterGrade(85), "B");
assertEq(letterGrade(75), "C");
assertEq(letterGrade(65), "D");
assertEq(letterGrade(42), "F");
print("letterGrade: all 5 tests passed!");

// Use thread and dbg to process a list of scores
let scores = [88, 92, 76, 95, 61];
let total = dbg(reduce(scores, +, 0));
let avg = dbg(total / count(scores));
let grade = dbg(letterGrade(avg));

// Defensive check with tryOr
let safeAvg = tryOr(reduce([], +, 0) / 0, 0);
assertEq(safeAvg, 0);
print("safe division by zero handled!");

// Final assertion
assert(grade == "B" || grade == "C");
unless(grade == "F", print("The class is doing fine!"));

print("── done ──")`,
  },
  {
    id: 'ast-coverage-extended',
    name: 'AST coverage (extended)',
    description: 'Comprehensive coverage of operators, destructuring, functions, effects, match patterns, and collections.',
    category: 'Test Fixtures',
    effectHandlers: [
      // I/O — deterministic, no console output
      { pattern: 'dvala.io.print', handler: '({ arg, resume }) => { resume(arg) }' },
      { pattern: 'dvala.io.error', handler: '({ arg, resume }) => { resume(arg) }' },
      { pattern: 'dvala.io.read', handler: '({ resume }) => { resume("test-input") }' },
      { pattern: 'dvala.io.pick', handler: '({ arg, resume }) => { const items = Array.isArray(arg) ? arg : arg.items; resume(items[0]) }' },
      { pattern: 'dvala.io.confirm', handler: '({ resume }) => { resume(true) }' },
      { pattern: 'dvala.io.readStdin', handler: '({ resume }) => { resume("stdin-line") }' },
      // Random — deterministic stubs
      { pattern: 'dvala.random', handler: '({ resume }) => { resume(0.42) }' },
      { pattern: 'dvala.random.uuid', handler: '({ resume }) => { resume("00000000-0000-0000-0000-000000000042") }' },
      { pattern: 'dvala.random.int', handler: '({ arg, resume }) => { const [lo, hi] = Array.isArray(arg) ? arg : [0, arg]; resume(lo) }' },
      { pattern: 'dvala.random.shuffle', handler: '({ arg, resume }) => { resume([...arg].reverse()) }' },
      { pattern: 'dvala.random.item', handler: '({ arg, resume }) => { resume(arg[0]) }' },
      // Time — deterministic
      { pattern: 'dvala.time.now', handler: '({ resume }) => { resume(1700000000000) }' },
      { pattern: 'dvala.time.zone', handler: '({ resume }) => { resume("UTC") }' },
      // Misc
      { pattern: 'dvala.sleep', handler: '({ resume }) => { resume(null) }' },
      { pattern: 'dvala.checkpoint', handler: '({ resume }) => { resume(null) }' },
    ],
    code: dvala`
// === AST Node Coverage (Extended) ===
// 29 sections — baseline for e2e and performance tests.

// --- 1: Primitives & Templates ---
let s1 = [42, 3.14, "hello", true, false, null, \`tmpl \${1 + 2}\`, \`\${"a"}\${"b"}\`];

// --- 2: Arithmetic ---
let s2 = [10 + 3, 10 - 3, 10 * 3, 10 / 4, 2 ^ 10, 17 % 5, -42, -(3 + 4)];

// --- 3: Comparison ---
let s3 = [1 < 2, 2 > 1, 3 <= 3, 4 >= 4, 5 == 5, 5 != 6];

// --- 4: Logical & Nullish ---
let s4 = [true && 42, false || "fb", null ?? "def", null ?? null ?? "x", true && true && 99];

// --- 5: Bitwise ---
let s5 = [5 & 3, 5 | 3, 5 xor 3, 1 << 3, 16 >> 2, -1 >>> 28];

// --- 6: Concat & Pipe ---
let s6 = ["a" ++ "b" ++ "c", [1, 2] ++ [3], 5 |> inc, 5 |> inc |> (x -> x * 2), [3, 1, 2] |> sort |> first];

// --- 7: Array & Object & Spread ---
let baseArr = [1, 2, 3];
let baseObj = { x: 1, y: 2 };
let s7 = [[], [1, 2, 3], {}, { a: 1, b: "two" }, [0, ...baseArr, 4], { ...baseObj, z: 3 }];

// --- 8: Destructuring - array ---
let [da, db] = [10, 20];
let [, skipped] = [1, 2, 3];
let [dHead, ...dTail] = [1, 2, 3, 4];
let [dp = 0, dq = 99] = [7];
let s8 = [da, db, skipped, dHead, dTail, dp, dq];

// --- 9: Destructuring - object ---
let objSrc = { a: 1, b: 2, c: 3 };
let { a, b, c } = objSrc;
let { a as aliased } = objSrc;
let { ...objRest } = { x: 1, y: 2 };
let s9 = [a + b + c, aliased, objRest];

// --- 10: Destructuring - nested ---
let deepObj = { user: { name: "Alice", tags: ["admin", "dev"] } };
let { user: { name, tags: [firstTag, ...otherTags] } } = deepObj;
let s10 = [name, firstTag, otherTags];

// --- 11: Block ---
let s11 = [do let t = 10; t + 1 end, do let v1 = 1; let v2 = 2; v1 + v2 end];

// --- 12: If / else if ---
let s12 = [
  if true then "yes" else "no" end,
  if false then 1 else if false then 2 else 3 end,
  if false then "x" else null end,
];

// --- 13: Functions - all forms ---
let fId = (x) -> x;
let fAdd = (a, b) -> a + b;
let fNone = () -> 99;
let fShort = -> $ + 1;
let fShort2 = -> $ + $2;
let fDef = (a, b = 10) -> a + b;
let fRest = (h, ...t) -> [h, count(t)];
let fBlock = (n) -> do let d = n * 2; d + n end;
let s13 = [fId(1), fAdd(2, 3), fNone(), fShort(10), fShort2(3, 4), fDef(5), fDef(5, 20), fRest(1, 2, 3), fBlock(10)];

// --- 14: Higher order ---
let s14 = [
  map([1, 2, 3], (x) -> x * x),
  filter([1, 2, 3, 4, 5], isOdd),
  reduce([1, 2, 3, 4], +, 0),
  apply(fAdd, [10, 20]),
];

// --- 15: Composition & meta ---
let fNeg = (x) -> -x;
let fDbl = (x) -> x * 2;
let negDbl = comp(fNeg, fDbl);
let always42 = constantly(42);
let documented = fAdd withDoc "Adds two numbers";
let s15 = [negDbl(5), always42("x"), identity(99), doc(documented)];

// --- 16: Arity ---
let s16 = [arity(fAdd), arity(fDef), arity(fRest), arity(fNone), arity(+)];

// --- 17: Self-recursion ---
let factorial = (n) -> if n <= 1 then 1 else n * self(n - 1) end;
let s17 = [factorial(10), factorial(1), factorial(0)];

// --- 18: Loop / recur ---
let s18 = [
  loop (i = 0, acc = 0) -> if i >= 100 then acc else recur(i + 1, acc + i) end,
  loop (n = 20, fa = 0, fb = 1) -> if n == 0 then fa else recur(n - 1, fb, fa + fb) end,
  loop (s = "a") -> if count(s) >= 5 then s else recur(s ++ "a") end,
];

// --- 19: For - variants ---
let s19 = [
  for (x in [1, 2, 3]) -> x * 10,
  for (x in range(5)) -> x ^ 2,
  for (x in [1, 2, 3, 4, 5] let sq = x ^ 2) -> sq,
  for (x in range(1, 20) when isEven(x)) -> x,
  for (x in range(100) while x < 5) -> x,
  for (x in [1, 2], y in [10, 20]) -> x + y,
  for (n in range(1, 30) let sq = n ^ 2 when isOdd(n) while sq < 200) -> sq,
];

// --- 20: Match ---
let mLit = (v) -> match v case 0 then "zero" case 1 then "one" case "hi" then "greet" case true then "yes" case null then "nil" case _ then "other" end;
let mGuard = (n) -> match n case x when x < 0 then "neg" case 0 then "zero" case x when x > 100 then "big" case x then "pos" end;
let mDestr = (s) -> match s case { x, y, z } then "3d" case { x, y } then "2d" case [a, b, c] then "triple" case [a, b] then "pair" case _ then "?" end;
let s20 = [
  [mLit(0), mLit(1), mLit("hi"), mLit(true), mLit(null), mLit(42)],
  [mGuard(-5), mGuard(0), mGuard(200), mGuard(7)],
  [mDestr({ x: 1, y: 2 }), mDestr({ x: 1, y: 2, z: 3 }), mDestr([1, 2]), mDestr([1, 2, 3]), mDestr("?")],
];

// --- 21: Effects & Handlers ---
let { fallback } = import("effectHandler");
let s21 = [
  effectName(@dvala.io.print), isEffect(@dvala.io.print),
  do with fallback("a"); perform(@dvala.io.pick, ["a", "b"]) end,
  do with fallback(0); perform(@dvala.io.pick, [10, 20]) end,
  fallback(1)(-> perform(@dvala.io.pick, [1, 2])),
  fallback(0)(-> 0 / 0),
  do with handler @custom.eff(x) -> resume(x + 1) end; let v = perform(@custom.eff, 5); v * 10 end,
  do with handler @custom.eff(x) -> resume(x ++ "!") end; perform(@custom.eff, "hello") end,
];

// --- 22: Import ---
let { sin, cos } = import("math");
let s22 = [sin(0), cos(0), sin(0) + cos(0)];

// --- 23: Regexp ---
let s23 = ["abc123" reMatch #"(\\w+?)(\\d+)", replace("hello world", #"world", "dvala")];

// --- 24: Type predicates ---
let s24 = [
  isNumber(42), isString("x"), isBoolean(true), isNull(null),
  isArray([]), isObject({}), isFunction(inc), isEffect(@dvala.io.print),
  isInteger(3), isInteger(3.5), isEven(4), isOdd(3),
  isZero(0), isPos(1), isNeg(-1), isEmpty([]), isNotEmpty([1]),
];

// --- 25: Collection ops ---
let s25 = [
  sort([3, 1, 4, 1, 5]), reverse([1, 2, 3]),
  take([1, 2, 3, 4, 5], 3), takeLast([1, 2, 3, 4, 5], 2),
  drop([1, 2, 3, 4, 5], 2), dropLast([1, 2, 3, 4, 5], 2),
  takeWhile([1, 2, 3, 4, 1], (x) -> x < 4), dropWhile([1, 2, 3, 4, 1], (x) -> x < 3),
  flatten([[1, 2], [3, [4, 5]]]),
  nth([10, 20, 30], 1), first([10, 20, 30]), last([10, 20, 30]), second([10, 20, 30]),
  pop([1, 2, 3]), rest([1, 2, 3]), next([1, 2, 3]),
  some([1, 2, 3, 4], isEven), indexOf([10, 20, 30], 20),
  contains([1, 2, 3], 2), count([1, 2, 3]),
  push([1, 2], 3), repeat("x", 3), range(3),
  assoc({ a: 1 }, "b", 2), dissoc({ a: 1, b: 2 }, "a"),
  merge({ a: 1 }, { b: 2 }), mergeWith({ a: 1, b: 2 }, { a: 10, c: 3 }, +),
  keys({ x: 1, y: 2 }), vals({ x: 1, y: 2 }), entries({ x: 1, y: 2 }),
  zipmap(["a", "b"], [1, 2]), selectKeys({ a: 1, b: 2, c: 3 }, ["a", "c"]),
  find({ a: 1, b: 2 }, "a"),
];

// --- 26: Partial application ---
let add10 = +(_, 10);
let s26 = [add10(5), map([1, 2, 3], +(_, 100))];

// --- 27: String operations ---
let s27 = [
  str(42), number("42"), lowerCase("HELLO"), upperCase("hello"), trim("  hi  "),
  join(["a", "b", "c"], "-"), split("a-b-c", "-"),
  count("hello"), contains("hello", "ell"), slice("abcdef", 1, 4),
  isBlank(""), isBlank("  "), isBlank("x"),
];

// --- 28: Math ---
let s28 = [
  abs(-5), sign(-3), sign(0), sign(7),
  min(3, 1, 4), max(3, 1, 4),
  round(3.7), floor(3.7), ceil(3.2), trunc(3.7),
  sqrt(16), cbrt(27), inc(5), dec(5),
];

// --- 29: All standard effects (deterministic via host handlers) ---
let s29 = [
  perform(@dvala.io.print, "hello"),
  perform(@dvala.io.error, "err"),
  perform(@dvala.io.read, "prompt?"),
  perform(@dvala.io.pick, ["alpha", "beta", "gamma"]),
  perform(@dvala.io.confirm, "ok?"),
  perform(@dvala.io.readStdin),
  perform(@dvala.random),
  perform(@dvala.random.uuid),
  perform(@dvala.random.int, [1, 100]),
  perform(@dvala.random.item, ["a", "b", "c"]),
  perform(@dvala.random.shuffle, [1, 2, 3]),
  perform(@dvala.time.now),
  perform(@dvala.time.zone),
  perform(@dvala.sleep, 0),
];

// --- 30: Stats, linear algebra & matrices on collected numeric data ---
let allPrev = [
  ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8, ...s9, ...s10,
  ...s11, ...s12, ...s13, ...s14, ...s15, ...s16, ...s17, ...s18, ...s19, ...s20,
  ...s21, ...s22, ...s23, ...s24, ...s25, ...s26, ...s27, ...s28, ...s29,
];

let vec = import("vector");
let la = import("linearAlgebra");
let matMod = import("matrix");
let r3 = (x) -> round(x * 1000) / 1000;
let bar = (val, mx, w) -> do
  let len = max(round(val / mx * w), 0);
  join(repeat("\u2588", len), "") ++ join(repeat("\u2591", w - len), "")
end;

let nums = filter(flatten(allPrev), isNumber);
let outliers = vec.outliers(nums);
let clean = filter(nums, (x) -> not(contains(outliers, x)));
let mn = vec.mean(clean);
let sd = vec.stdev(clean);
let q = vec.quartiles(clean);
let hist = vec.histogram(clean, 6);
let histMax = max(...map(hist, last));

let v1 = [3, 4, 0];
let v2 = [0, 4, 3];
let m1 = [[1, 2], [3, 4]];
let mInv = matMod.inv(m1);
let xs = for (i in range(10)) -> i * 1.0;
let ys = for (i in range(10)) -> i * 2.0 + 1;

let analysis = {
  distribution: {
    nRaw: count(nums),
    outliers,
    nClean: count(clean),
    range: [min(...clean), max(...clean)],
    span: vec.span(clean),
    mean: r3(mn),
    median: vec.median(clean),
    stdev: r3(sd),
    skewness: r3(vec.skewness(clean)),
    rms: r3(vec.rms(clean)),
    quartiles: map(q, r3),
    iqr: r3(vec.iqr(clean)),
    histogram: map(hist, (row) -> {
      lo: r3(first(row)),
      hi: r3(second(row)),
      count: last(row),
    }),
    runningMean: map(vec.runningMean(take(clean, 8)), r3),
    cumulativeSum: vec.cumsum(take(clean, 6)),
  },
  geometry: {
    v1,
    v2,
    dot: la.dot(v1, v2),
    cross: la.cross(v1, v2),
    angle: r3(la.angle(v1, v2)),
    cosineSimilarity: r3(la.cosineSimilarity(v1, v2)),
    euclideanDistance: r3(la.euclideanDistance(v1, v2)),
    euclideanNorm: la.euclideanNorm(v1),
    orthogonalCheck: la.isOrthogonal([1, 0], [0, 1]),
    rotate90: map(la.rotate2d([1, 0], 3.14159265 / 2), r3),
    lerp: la.lerp([0, 0], [10, 20], 0.5),
    projection: la.projection([3, 4], [1, 0]),
  },
  correlation: {
    xs,
    ys,
    pearson: la.pearsonCorr(xs, ys),
    spearman: la.spearmanCorr(xs, ys),
    covariance: r3(la.cov(xs, ys)),
    normMinmax: la.normalizeMinmax([10, 20, 30, 40, 50]),
    normL2: map(la.normalizeL2([10, 20, 30, 40, 50]), r3),
  },
  matrix: {
    m: m1,
    product: matMod.mul(m1, [[5, 6], [7, 8]]),
    determinant: matMod.det(m1),
    trace: matMod.trace(m1),
    inverse: map(mInv, (row) -> map(row, r3)),
    rank: matMod.rank(m1),
    frobeniusNorm: r3(matMod.frobeniusNorm(m1)),
    hilbert3: matMod.hilbert(3),
    verifyInverse: r3(matMod.det(matMod.mul(m1, mInv))),
  },
  linearSystem: {
    equations: "2x + y = 5,  x + 3y = 10",
    solution: la.solve([[2, 1], [1, 3]], [5, 10]),
  },
  display: [
    "======================================",
    "       STATISTICAL ANALYSIS           ",
    "======================================",
    \`  n=\${count(nums)} raw, \${count(outliers)} outliers removed, \${count(clean)} clean\`,
    \`  outliers: [\${join(map(outliers, str), ", ")}]\`,
    \`  range=\${min(...clean)}..\${max(...clean)}  span=\${vec.span(clean)}\`,
    \`  mean=\${r3(mn)}  median=\${vec.median(clean)}  stdev=\${r3(sd)}\`,
    \`  skewness=\${r3(vec.skewness(clean))}  rms=\${r3(vec.rms(clean))}\`,
    \`  Q1=\${r3(q[0])}  Q2=\${r3(q[1])}  Q3=\${r3(q[2])}  IQR=\${r3(vec.iqr(clean))}\`,
    "--- histogram (outliers removed) ---",
    ...map(hist, (row) -> do
      let ct = last(row);
      \`  \${bar(ct, histMax, 20)}  \${ct}  [\${r3(first(row))}, \${r3(second(row))})\`
    end),
    "--- running mean (first 8) ---",
    \`  \${join(map(vec.runningMean(take(clean, 8)), r3), " > ")}\`,
    "======================================",
    "       VECTOR GEOMETRY                ",
    "======================================",
    \`  v1=[\${join(v1, ",")}]  v2=[\${join(v2, ",")}]\`,
    \`  dot=\${la.dot(v1, v2)}  cross=[\${join(la.cross(v1, v2), ",")}]\`,
    \`  angle=\${r3(la.angle(v1, v2))}rad  cosine=\${r3(la.cosineSimilarity(v1, v2))}\`,
    \`  norm(v1)=\${la.euclideanNorm(v1)}  dist=\${r3(la.euclideanDistance(v1, v2))}\`,
    \`  rotate [1,0] by pi/2 = [\${join(map(la.rotate2d([1, 0], 3.14159265 / 2), r3), ",")}]\`,
    "======================================",
    "       CORRELATION & MATRIX           ",
    "======================================",
    \`  pearson=\${la.pearsonCorr(xs, ys)}  spearman=\${la.spearmanCorr(xs, ys)}  cov=\${r3(la.cov(xs, ys))}\`,
    \`  M=[[\${m1[0][0]},\${m1[0][1]}],[\${m1[1][0]},\${m1[1][1]}]]  det=\${matMod.det(m1)}  trace=\${matMod.trace(m1)}  rank=\${matMod.rank(m1)}\`,
    \`  solve 2x+y=5, x+3y=10 => [\${join(map(la.solve([[2, 1], [1, 3]], [5, 10]), r3), ", ")}]\`,
    "======================================",
  ],
};

let s30 = [analysis];

// --- Assemble ---
let allResults = [...allPrev, ...s30];
{ results: allResults, totalResults: count(allResults) }`,
  },
]
