export interface Example {
  id: string
  name: string
  description: string
  code: string
  context?: {
    bindings?: Record<string, unknown>
    effectHandlers?: { pattern: string; handler: string }[]
  }
}

export const examples: Example[] = [
  {
    id: 'default',
    name: 'Simple Dvala program',
    description: 'A super simple example.',
    code: `
10 + 20
    `.trim(),
  },
  {
    id: 'collection-accessor',
    name: 'Collection accessors',
    description: 'Syntactic sugar for accessing object, array and string elements.',
    code: `
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
perform(@dvala.io.print, [1, 2, 3][2]);
    `.trim(),
  },
  {
    id: 'template-strings',
    name: 'Template strings',
    description: 'Template strings use backticks and support ${...} interpolation for embedding expressions directly in strings.',
    code: `
// Template strings embed expressions with \${...}
let name = "Alice";
let score = 42;

perform(@dvala.io.print, \`Hello, \${name}!\`);
perform(@dvala.io.print, \`Score: \${score}/100\`);

// Any expression works inside \${...}
let items = ["apple", "banana", "cherry"];
for (i in range(count(items))) ->
  perform(@dvala.io.print, \`\${i + 1}. \${items[i]}\`)
    `.trim(),
  },
  {
    id: 'simple-context-example',
    name: 'Using context',
    description: 'Simple example using bindings and a host effect handler.',
    context: {
      bindings: { x: 15, y: 27 },
      effectHandlers: [
        { pattern: 'host.plus', handler: 'async ({ arg: [a, b], resume }) => { resume(a + b) }' },
      ],
    },
    code: `
perform(@host.plus, [x, y])
    `.trim(),
  },
  {
    id: 'async-example',
    name: 'Async host effects',
    description: 'Demonstrates calling async JavaScript from Dvala via effect handlers.',
    context: {
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
    },
    code: `
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
for (post in posts) -> perform(@dvala.io.print, "- " ++ post.title);
    `.trim(),
  },
  {
    id: 'async-interactive',
    name: 'Interactive async',
    description: 'A more complex async example with user interactions. Uses prompt for input and fetch for API calls.',
    context: {
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
    },
    code: `
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
    perform(@dvala.io.print, "  ... and " ++ str(count(done) - 5) ++ " more");
  end;

  perform(@dvala.io.print, "\\nPending (" ++ str(count(pending)) ++ "):");
  for (t in pending take 5) -> perform(@dvala.io.print, "  ○ " ++ t.title);
  if count(pending) > 5 then
    perform(@dvala.io.print, "  ... and " ++ str(count(pending) - 5) ++ " more");
  end
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
          if show == "yes" then showTodos(user) end;
        end;
        perform(@dvala.io.print, "");
        recur(true)
      end

    else null end
end;

main()
    `.trim(),
  },
  {
    id: 'text-based-game',
    name: 'A game',
    description: 'Text based adventure game.',
    code: `
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
startGame()    
    `.trim(),
  },
  {
    id: 'determinant',
    name: 'Determinant',
    description: 'Determinant function for square matrices.',
    code: `
// Determinant function for square matrices
let determinant = (matrix) -> do
  // Check if input is an array
  if not(isArray(matrix)) then
    perform(@dvala.error, "Input must be an array");
  end;

  // Check if matrix is empty
  if isEmpty(matrix) then
    perform(@dvala.error, "Matrix cannot be empty");
  end;

  let rows = count(matrix);
  
  // Get first row to check column count
  let firstRow = first(matrix);
  
  // Check if first row is an array
  if not(isArray(firstRow)) then
    perform(@dvala.error, "Input must be a 2D array");
  end;
  
  let cols = count(firstRow);
  
  // Ensure matrix is square
  if rows != cols then
    perform(@dvala.error, "Matrix must be square");
  end;
  
  // Base case: 1x1 matrix
  if rows == 1 then
    matrix[0][0];
  else
    // Base case: 2x2 matrix
    if rows == 2 then
      let a = matrix[0][0];
      let b = matrix[0][1];
      let c = matrix[1][0];
      let d = matrix[1][1];
      
      a * d - b * c;
    else
      // For larger matrices, use cofactor expansion along first row
      // Use reduce to calculate the determinant without mutating variables
      reduce(
        range(cols),
        (acc, j) -> do
          let minor = getMinor(matrix, 0, j);
          let cofactor = determinant(minor);
          let signFactor = if isEven(j) then 1 else -1 end;
          let term = signFactor * matrix[0][j] * cofactor;
          
          acc + term;
        end,
        0,
      );
  end
end;

// Helper function to get minor (submatrix) by removing specific row and column
let getMinor = (matrix, rowToRemove, colToRemove) -> do
  // Use map with filter to create the new matrix without mutating
  map(
    range(count(matrix)),
    i -> do
      if i == rowToRemove then
        null; // This will be filtered out
      else
        let row = get(matrix, i);
        // Filter out the column to remove
        map(
          range(count(row)),
          j -> do
            if j == colToRemove then
              null; // This will be filtered out
            else
              get(row, j)
            end
          end
        ) filter (item -> item != null);
      end
    end
  ) filter (row -> row != null);
end;
  
// 4x4 invertible matrix
let matrix4x4 = [
  [4,  3,  2,  2],
  [0,  1, -3,  3],
  [0, -1,  3,  3],
  [0,  3,  1,  1]
];
determinant(matrix4x4);
    `.trim(),
  },
  {
    id: 'matrix-multiplication',
    name: 'Matrix multiplication',
    description: 'Matrix multiplication with correct syntax.',
    code: `
// Matrix multiplication with correct syntax
let matrixMultiply = (matrixA, matrixB) -> do
  // Check if inputs are arrays
  if not(isArray(matrixA)) then perform(@dvala.error, "First input must be an array") end;
  if not(isArray(matrixB)) then perform(@dvala.error, "Second input must be an array") end;

  // Check if matrices are not empty
  if isEmpty(matrixA) || isEmpty(matrixB) then perform(@dvala.error, "Matrices cannot be empty") end;

  // Check if matrices are 2D arrays
  if not(isArray(first(matrixA))) then perform(@dvala.error, "First input must be a 2D array") end;
  if not(isArray(first(matrixB))) then perform(@dvala.error, "Second input must be a 2D array") end;

  // Get dimensions
  let rowsA = count(matrixA);
  let colsA = count(first(matrixA));
  let rowsB = count(matrixB);
  let colsB = count(first(matrixB));

  // Check if all rows have consistent length
  if some(matrixA, row -> not(isArray(row)) || count(row) != colsA) then
    perform(@dvala.error, "First matrix has inconsistent row lengths")
  end;

  if some(matrixB, row -> not(isArray(row)) || count(row) != colsB) then
    perform(@dvala.error, "Second matrix has inconsistent row lengths")
  end;

  // Check if matrices can be multiplied
  if not(colsA == rowsB) then
    perform(@dvala.error, "Matrix dimensions mismatch: first matrix columns must equal second matrix rows");
  end;

  // Create a row of the result matrix
  let createRow = (rowIndex) -> do
    for (j in range(colsB)) -> do
      reduce(
        range(colsA),
        (sum, k) -> do
          let aValue = matrixA[rowIndex][k];
          let bValue = matrixB[k][j];
          sum + (aValue * bValue);
        end,
        0
      )
    end
  end;

  // Create the result matrix row by row
  for (i in range(rowsA)) -> createRow(i);
end;

let matrixA = [
  [1, 2, 3],
  [4, 5, 6]
];

let matrixB = [
  [7, 8],
  [9, 10],
  [11, 12]
];

matrixMultiply(matrixA, matrixB);
`.trim(),
  },
  {
    id: 'phone-number-formatter',
    name: 'Phone number formatter',
    description: 'Pretty prints a US phone number.',
    code: `
let formatPhoneNumber = (data) -> do
  if isString(data) then
    let phoneNumber = if data[0] == "+" then slice(data, 2) else data end;
    let length = count(phoneNumber);

    if length > 6 then
      "(" ++ slice(phoneNumber, 0, 3) ++ ") " ++ slice(phoneNumber, 3, 6) ++ "-" ++ slice(phoneNumber, 6)
    else if length > 3 then
      "(" ++ slice(phoneNumber, 0, 3) ++ ") " ++ slice(phoneNumber, 3)
    else if length > 0 then
      "(" ++ slice(phoneNumber, 0)
    else ""
    end
  else
    ""
  end
end;


perform(@dvala.io.print, formatPhoneNumber);
perform(@dvala.io.print, formatPhoneNumber(123234));
perform(@dvala.io.print, formatPhoneNumber("123234"));
perform(@dvala.io.print, formatPhoneNumber("1232343456"));
perform(@dvala.io.print, formatPhoneNumber("+11232343456789"));
perform(@dvala.io.print, formatPhoneNumber("+11232343456"));
  `.trim(),
  },
  {
    id: 'factorial',
    name: 'Factorial',
    description: 'A recursive implementation of the factorial function.',
    code: `
let factorial = (x) -> do
  if x == 1 then
    1
  else
    x * self(x - 1)
  end
end;

factorial(5)
  `.trim(),

  },
  {
    id: 'sort',
    name: 'Sort',
    description: 'Sort an array of numbers.',
    code: `
let l = [7, 39, 45, 0, 23, 1, 50, 100, 12, -5];
let numberComparer = (a, b) -> do
  if a < b then -1
  else if a > b then 1
  else 0
  end
end;

sort(l, numberComparer)
      `.trim(),
  },
  {
    id: 'isoDateString',
    name: 'Is ISO date string',
    description: 'Check if string is formatted as an ISO date string.',
    code: `
let isIsoDateString = (data) -> do
  let m = data reMatch #"^(\\d{4})-(\\d{2})-(\\d{2})$";

  if m then
    let [year, month, day] = slice(m, 1) map number;
    let leapYear = isZero(year mod 4) && (not(isZero(year mod 100)) || isZero(year mod 400));

    let invalid = 
      (year < 1900 || year > 2100)
      || (month < 1 || month > 12)
      || (day < 1 || day > 31)
      || day > 30 && (month == 4 || month == 6 || month == 9 || month == 11)
      || month == 2 && (leapYear && day > 29 || not(leapYear) && day > 28);

    not(invalid)
  else
    false
  end
end;

perform(@dvala.io.print, isIsoDateString("1978-12-21"));
perform(@dvala.io.print, isIsoDateString("197-12-21"));
  `.trim(),
  },

  {
    id: 'labelFromValue',
    name: 'labelFromValue',
    description: 'Find label to corresponding value in array of { label, value }-objects.',
    code: `
let labelFromValue = (items, value) -> do
  let entry = items some (-> value == $["value"]);
  if entry == null then
    null
  else
    entry["label"]
  end
end;


let items = [
  { label: "Name", value: "name" },
  { label: "Age", value: "age" }
];

labelFromValue(items, "name");
  `.trim(),
  },
  {
    id: 'labelsFromValues',
    name: 'labelsFromValues',
    description: 'Find labels to corresponding values in array of { label, value }-objects.',
    code: `
let labelsFromValues = ($array, $values) -> do
  for (
    value in $values
    let label = do
      let entry = $array some -> value == $["value"];
      if entry == null then
        value
      else
        entry["label"]
      end
    end
  ) -> label
end;

let arr = [
  { label: "Name", value: "name" },
  { label: "Age", value: "age" },
  { label: "Email", value: "email" },
];

labelsFromValues(arr, ["name", "age"])
`.trim(),
  },
  {
    id: 'fizzbuzz',
    name: 'FizzBuzz',
    description: 'The classic FizzBuzz challenge using a for comprehension with let bindings and if/else if.',
    code: `
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

fizzbuzz join ", "
`.trim(),
  },
  {
    id: 'playground-demo',
    name: 'Playground Effects Demo',
    description: 'Showcases playground.* effects — Dvala code that controls the playground UI. Load this in the playground and press Run.',
    code: `
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

"Done!"
`.trim(),
  },
  {
    id: 'ast-coverage',
    name: 'AST node coverage',
    description: 'Exercises all special expressions, operators, destructuring, effects, and node types. Useful for testing the AST tree viewer.',
    code: `
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

// --- Effect handling: handle/perform ---
let { fallback } = import(effectHandler);
let handled = handle
  let color = perform(@dvala.io.pick, ["Red", "Green", "Blue"]);
  color ++ " was chosen"
with fallback("Green") end;

// --- Effect pipe operator (||>) ---
let piped2 = perform(@dvala.io.pick, [1, 2, 3]) ||> fallback(1);

// --- Import ---
let mathMod = import(math);

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
]
    `.trim(),
  },
  {
    id: 'ast-coverage-extended',
    name: 'AST coverage (extended)',
    description: 'Comprehensive test covering all operators, destructuring variants, function forms, arity, all standard effects, handler chains, match patterns, for clauses, collection ops, and more. Used for baseline performance testing.',
    context: {
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
    },
    code: `
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
  if false then "x" end,
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
let { fallback, retry } = import(effectHandler);
let s21 = [
  effectName(@dvala.io.print), isEffect(@dvala.io.print),
  handle perform(@dvala.io.pick, ["a", "b"]) with fallback("a") end,
  handle perform(@dvala.io.pick, [10, 20]) with [fallback(0)] end,
  perform(@dvala.io.pick, [1, 2]) ||> fallback(1),
  (0 / 0) ||> fallback(0),
  handle let v = perform(@custom.eff, 5); v * 10 with @custom.eff(x) -> x + 1 end,
  handle perform(@custom.eff, "hello") with [retry(2), @custom.eff(x) -> x ++ "!"] end,
];

// --- 22: Import ---
let { sin, cos } = import(math);
let s22 = [sin(0), cos(0), sin(0) + cos(0)];

// --- 23: Regexp ---
let s23 = ["abc123" reMatch #"(\\w+?)(\\d+)", replace("hello world", #"world", "dvala")];

// --- 24: Type predicates ---
let s24 = [
  isNumber(42), isString("x"), isBoolean(true), isNull(null),
  isArray([]), isObject({}), isFunction(inc), isEffect(@dvala.io.print),
  isInteger(3), isInteger(3.5), isEven(4), isOdd(3),
  isZero(0), isPos(1), isNeg(-1), isEmpty([]), isNotEmpty([1]),
  isFinite(42), isFinite(1 / 0),
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

let vec = import(vector);
let la = import(linearAlgebra);
let matMod = import(matrix);
let rnd3 = (x) -> round(x * 1000) / 1000;

let nums = filter(flatten(allPrev), isNumber);
let statsResult = {
  n: count(nums),
  sum: vec.sum(nums),
  mean: rnd3(vec.mean(nums)),
  median: vec.median(nums),
  stdev: rnd3(vec.stdev(nums)),
  iqr: vec.iqr(nums),
  quartiles: vec.quartiles(nums),
  skewness: rnd3(vec.skewness(nums)),
  rms: rnd3(vec.rms(nums)),
  histogram: vec.histogram(nums, 4),
  cumsum5: vec.cumsum(take(nums, 5)),
  runMean5: map(vec.runningMean(take(nums, 5)), rnd3),
};

let v1 = [3, 4, 0];
let v2 = [0, 4, 3];
let geoResult = {
  dot: la.dot(v1, v2),
  cross: la.cross(v1, v2),
  angle: rnd3(la.angle(v1, v2)),
  cosine: rnd3(la.cosineSimilarity(v1, v2)),
  eucDist: rnd3(la.euclideanDistance(v1, v2)),
  norm: la.euclideanNorm(v1),
  isOrtho: la.isOrthogonal([1, 0], [0, 1]),
  rotate: map(la.rotate2d([1, 0], 3.14159265 / 2), rnd3),
  lerp: la.lerp([0, 0], [10, 20], 0.5),
  proj: la.projection([3, 4], [1, 0]),
};

let xs = for (i in range(10)) -> i * 1.0;
let ys = for (i in range(10)) -> i * 2.0 + 1;
let corrResult = {
  pearson: la.pearsonCorr(xs, ys),
  spearman: la.spearmanCorr(xs, ys),
  cov: rnd3(la.cov(xs, ys)),
};

let normResult = {
  minmax: la.normalizeMinmax([10, 20, 30, 40, 50]),
  l2: map(la.normalizeL2([10, 20, 30, 40, 50]), rnd3),
};

let m1 = [[1, 2], [3, 4]];
let matResult = {
  mul: matMod.mul(m1, [[5, 6], [7, 8]]),
  det: matMod.det(m1),
  trace: matMod.trace(m1),
  inv: map(matMod.inv(m1), (row) -> map(row, rnd3)),
  rank: matMod.rank(m1),
  frobNorm: rnd3(matMod.frobeniusNorm(m1)),
  isSquare: matMod.isSquare(m1),
  hilbert2: matMod.hilbert(2),
};

let linearSolve = la.solve([[2, 1], [1, 3]], [5, 10]);

let s30 = [statsResult, geoResult, corrResult, normResult, matResult, linearSolve];

// --- Assemble ---
let allResults = [...allPrev, ...s30];
{ results: allResults, totalResults: count(allResults) }
    `.trim(),
  },
]
