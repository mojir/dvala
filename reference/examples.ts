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

perform(@dvala.io.println, \`Hello, \${name}!\`);
perform(@dvala.io.println, \`Score: \${score}/100\`);

// Any expression works inside \${...}
let items = ["apple", "banana", "cherry"];
for (i in range(count(items))) ->
  perform(@dvala.io.println, \`\${i + 1}. \${items[i]}\`)
    `.trim(),
  },
  {
    id: 'simple-context-example',
    name: 'Using context',
    description: 'Simple example using bindings and a host effect handler.',
    context: {
      bindings: { x: 15, y: 27 },
      effectHandlers: [
        { pattern: 'host.plus', handler: 'async ({ args: [a, b], resume }) => { resume(a + b) }' },
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
        { pattern: 'host.fetch-user', handler: `async ({ args: [id], resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users/' + id);
    const user = await response.json();
    resume({ name: user.name, email: user.email, city: user.address.city });
  } catch(e) { fail(e.message) }
}` },
        { pattern: 'host.fetch-posts', handler: `async ({ args: [userId], resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?userId=' + userId);
    const posts = await response.json();
    resume(posts.slice(0, 3).map(p => ({ title: p.title, body: p.body })));
  } catch(e) { fail(e.message) }
}` },
        { pattern: 'host.delay', handler: `async ({ args: [ms], resume }) => {
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
let user = perform(@host.fetch-user, 1);
perform(@dvala.io.print, "User: " ++ user.name);
perform(@dvala.io.print, "Email: " ++ user.email);
perform(@dvala.io.print, "City: " ++ user.city);

// Fetch their posts
let posts = perform(@host.fetch-posts, 1);
perform(@dvala.io.print, "\\nFirst " ++ str(count(posts)) ++ " posts by " ++ user.name ++ ":");
doseq (post in posts) -> perform(@dvala.io.print, "- " ++ post.title);
    `.trim(),
  },
  {
    id: 'async-interactive',
    name: 'Interactive async',
    description: 'A more complex async example with user interactions. Uses prompt for input and fetch for API calls.',
    context: {
      effectHandlers: [
        { pattern: 'host.fetch-user', handler: `async ({ args: [id], resume, fail }) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users/' + id);
    if (!response.ok) { resume(null); return; }
    const user = await response.json();
    resume({ id: user.id, name: user.name, email: user.email, city: user.address.city, company: user.company.name });
  } catch(e) { fail(e.message) }
}` },
        { pattern: 'host.fetch-todos', handler: `async ({ args: [userId], resume, fail }) => {
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
// Uses dvala.io.read-line for user input and host.fetch-* for API calls

let lookup-user! = (id-str) -> do
  let id = number(id-str);
  if not(number?(id)) || id < 1 || id > 10 then
    perform(@dvala.io.print, "Invalid user ID: " ++ id-str ++ ". Please enter 1-10.");
  else
    perform(@dvala.io.print, "Fetching user " ++ str(id) ++ "...");
    let user = perform(@host.fetch-user, id);
    if null?(user) then
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

let show-todos! = (user) -> do
  perform(@dvala.io.print, "\\nFetching todos for " ++ user.name ++ "...");
  let todos = perform(@host.fetch-todos, user.id);
  let done = filter(todos, -> $.completed);
  let pending = filter(todos, -> not($.completed));

  perform(@dvala.io.print, "\\nCompleted (" ++ str(count(done)) ++ "/" ++ str(count(todos)) ++ "):");
  doseq (t in done take 5) -> perform(@dvala.io.print, "  ✓ " ++ t.title);
  if count(done) > 5 then
    perform(@dvala.io.print, "  ... and " ++ str(count(done) - 5) ++ " more");
  end;

  perform(@dvala.io.print, "\\nPending (" ++ str(count(pending)) ++ "):");
  doseq (t in pending take 5) -> perform(@dvala.io.print, "  ○ " ++ t.title);
  if count(pending) > 5 then
    perform(@dvala.io.print, "  ... and " ++ str(count(pending) - 5) ++ " more");
  end
end;

// Main interaction loop
let main! = () -> do
  perform(@dvala.io.print, "=== User Lookup Tool ===\\n");

  loop (continue? = true) ->
    if continue? then
      let input = perform(@dvala.io.read-line, "Enter a user ID (1-10), or cancel to quit:");
      if null?(input) || input == "" then
        perform(@dvala.io.print, "Goodbye!");
      else
        let user = lookup-user!(input);
        if user then
          let show = perform(@dvala.io.read-line, "Show todos for " ++ user.name ++ "? (yes/no)");
          if show == "yes" then show-todos!(user) end;
        end;
        perform(@dvala.io.print, "");
        recur(true)
      end

    else null end
end;

main!()
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
let initial-state = {
  current-location: "forest",
  inventory: [],
  visited: {},
  game-over: false,
  moves: 0,
  light-source: false
};

// Helper functions
let has-item? = (state, item) -> do
  contains?(state.inventory, item);
end;

let location-has-item? = (location, item) -> do
  contains?(get(location, "items", []), item);
end;

let describe-location = (state) -> do
  let location = get(locations, state.current-location);
  let description = location.description;

  // Add visited status
  let visited-status = if get(state.visited, state.current-location, 0) > 1 then
    "You've been here before."
  else
    "This is your first time here."
  end;

  // Check if location has items
  let items-desc = if not(empty?(get(location, "items", []))) then
    "You see: " ++ join(location.items, ", ")
  else
    ""
  end;

  // Describe exits
  let exits = keys(location.exits) join ", ";
  let exits-desc = "Exits: " ++ exits;

  // Join all descriptions
  filter([description, visited-status, items-desc, exits-desc], -> not(empty?($))) join "\\n"
end;

let get-location-items = (state) -> do
  let location = get(locations, state.current-location);
  get(location, "items", [])
end;

// Game actions
let move = (state, direction) -> do
  let location = get(locations, state.current-location);
  let exits = get(location, "exits", {});

  // Check if direction is valid
  if contains?(exits, direction) then
    let new-location = get(exits, direction);
    let is-dark = new-location == "tunnel" || new-location == "treasure room";

    // Check if player has light source for dark areas
    if is-dark && not(state.light-source) then
      [state, "It's too dark to go that way without a light source."]
    else
      let new-visited = assoc(
        state.visited,
        new-location,
        inc(state.visited["new-location"] ?? 0)
      );
      let new-state = assoc(
        assoc(
          assoc(state, "current-location", new-location),
          "visited",
          new-visited
        ),
        "moves",
        state.moves + 1
      );

      [new-state, "You move " ++ direction ++ " to the " ++ new-location ++ "."]
    end
  else
    [state, "You can't go that way."]
  end
end;

let take! = (state, item) -> do
  let items = get-location-items(state);

  if contains?(items, item) then
    let location = get(locations, state.current-location);
    let new-location-items = filter(items, -> $ != item);
    let new-inventory = push(state.inventory, item);

    // Update game state
    let new-locations = assoc(
      locations, 
      state.current-location,
      assoc(location, "items", new-location-items)
    );

    // Special case for torch
    let has-light = item == "torch" || state.light-source;

    // Update locations and state
    let locations = new-locations;
    let new-state = assoc(
      assoc(
        assoc(state, "inventory", new-inventory),
        "light-source", has-light
      ),
      "moves",
      state.moves + 1
    );
    [new-state, "You take the " ++ item ++ "."]
  else
    [state, "There is no " ++ item ++ " here."]
  end
end;

let drop! = (state, item) -> do
  if has-item?(state, item) then
    let location = get(locations, state.current-location);
    let location-items = get(location, "items", []);
    let new-location-items = push(location-items, item);
    let new-inventory = filter(-> $ != item, state.inventory);

    // Special case for torch
    let still-has-light = not(item == "torch") || contains?(new-inventory, "torch");

    // Update locations and state
    let new-location = assoc(location, "items", new-location-items);
    let locations = assoc(locations, state.current-location, new-location);

    let new-state = assoc(
      assoc(
        assoc(
          state, "inventory", new-inventory),
          "light-source",
          still-has-light
        ),
        "moves",
        state.moves + 1
      );
    [new-state, "You drop the " ++ item ++ "."]
  else
    [state, "You don't have a " ++ item ++ " in your inventory."]
  end
end;

let inventory = (state) -> do
  if empty?(state.inventory) then
    [state, "Your inventory is empty."]
  else
    [state, "Inventory: " ++ join(state.inventory, ", ")]
  end
end;

let use = (state, item) -> do
  match item
    case "fishing rod" then
      if state.current-location == "river" then
        [assoc(state, "moves", state.moves + 1), "You catch a small fish, but it slips away."]
      else
        [state, "There's no place to use a fishing rod here."]
      end
    case "torch" then
      if has-item?(state, item) then
        [
          assoc(assoc(state, "light-source", true), "moves", state.moves + 1),
          "The torch illuminates the area with a warm glow."
        ]
      else
        [state, "You don't have a torch."]
      end
    case "gold key" then
      if has-item?(state, item) && state.current-location == "treasure room" then
        [
          assoc(
            assoc(state, "game-over", true),
            "moves",
            state.moves + 1
          ),
         "You use the gold key to unlock a secret compartment, revealing a fabulous diamond! You win!"
        ]
      else
        [state, "The key doesn't fit anything here."]
      end
    case "bread" then
      if has-item?(state, item) then
        let new-inventory = filter(state.inventory, -> $ != item);
        [
          assoc(
            assoc(state, "inventory", new-inventory),
            "moves",
            state.moves + 1
          ),
          "You eat the bread. It's delicious and nourishing."
        ]
      else
        [state, "You don't have any bread."]
      end
    case "shiny stone" then
      if has-item?(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "The stone glows with a faint blue light. It seems magical but you're not sure how to use it yet."
        ]
      else
        [state, "You don't have a shiny stone."]
      end
    case "flowers" then
      if has-item?(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "You smell the flowers. They have a sweet, calming fragrance."
        ]
      else
        [state, "You don't have any flowers."]
      end
    case "ancient map" then
      if has-item?(state, item) then
        [
          assoc(state, "moves", state.moves + 1),
          "The map shows the layout of the area. All locations are now marked as visited."
        ]
      else
        [state, "You don't have a map."]
      end
    case "jeweled crown" then
      if has-item?(state, item) then
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
let parse-command = (state, input) -> do
  let tokens = lower-case(input) split " ";
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
      take!(state, args)
    case "drop" then
      drop!(state, args)
    case "inventory" then
      inventory(state)
    case "i" then
      inventory(state)
    case "look" then
      [assoc(state, "moves", state.moves + 1), describe-location(state)]
    case "use" then
      use(state, args)
    case "help" then
      [state, "Commands then go [direction], north, south, east, west, take [item], drop [item], inventory, look, use [item], help, quit"]
    case "quit" then
      [assoc(state, "game-over", true), "Thanks for playing!"]
  end ?? [state, "I don't understand that command. Type 'help' for a list of commands."];

  result
end;

// Game loop
let game-loop = (state) -> do
  let input = perform(@dvala.io.read-line, describe-location(state) ++ "\\nWhat do you do? ");
  let command_result = parse-command(state, input);
  let new-state = first(command_result);
  let message = second(command_result);

  perform(@dvala.io.print, "\\n" ++ message ++ "\\n");

  if new-state.game-over then
    perform(@dvala.io.print, "\\nGame over! You made " ++ str(new-state.moves) ++ " moves.");
    new-state
  else
    game-loop(new-state)
  end
end;

// Start game
let start-game = () -> do
  perform(@dvala.io.print, "=== Dvala Adventure Game ===\\n" ++ "Type 'help' for a list of commands.\\n\\n");
  game-loop(initial-state)
end;

// Call the function to start the game
start-game()    
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
  unless array?(matrix) then
    perform(@dvala.error, "Input must be an array");
  end;

  // Check if matrix is empty
  if empty?(matrix) then
    perform(@dvala.error, "Matrix cannot be empty");
  end;

  let rows = count(matrix);
  
  // Get first row to check column count
  let firstRow = first(matrix);
  
  // Check if first row is an array
  unless array?(firstRow) then
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
          let signFactor = if even?(j) then 1 else (0 - 1) end;
          let term = signFactor * matrix[0][j] * cofactor;
          
          acc + term;
        end,
        0,
      );
    end
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
  unless array?(matrixA) then perform(@dvala.error, "First input must be an array") end;
  unless array?(matrixB) then perform(@dvala.error, "Second input must be an array") end;

  // Check if matrices are not empty
  if empty?(matrixA) || empty?(matrixB) then perform(@dvala.error, "Matrices cannot be empty") end;

  // Check if matrices are 2D arrays
  unless array?(first(matrixA)) then perform(@dvala.error, "First input must be a 2D array") end;
  unless array?(first(matrixB)) then perform(@dvala.error, "Second input must be a 2D array") end;

  // Get dimensions
  let rowsA = count(matrixA);
  let colsA = count(first(matrixA));
  let rowsB = count(matrixB);
  let colsB = count(first(matrixB));

  // Check if all rows have consistent length
  unless every?(matrixA, row -> array?(row) && count(row) == colsA) then
    perform(@dvala.error, "First matrix has inconsistent row lengths")
  end;
  
  unless every?(matrixB, row -> array?(row) && count(row) == colsB) then
    perform(@dvala.error, "Second matrix has inconsistent row lengths")
  end;

  // Check if matrices can be multiplied
  unless colsA == rowsB then
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
  if string?(data) then
    let phoneNumber = if data[0] == "+" then slice(data, 2) else data end;
    let length = count(phoneNumber);

    cond
      case length > 6 then
        "(" ++ slice(phoneNumber, 0, 3) ++ ") " ++ slice(phoneNumber, 3, 6) ++ "-" ++ slice(phoneNumber, 6)
      case length > 3 then
        "(" ++ slice(phoneNumber, 0, 3) ++ ") " ++ slice(phoneNumber, 3)
      case length > 0 then
        "(" ++ slice(phoneNumber, 0)
    end ?? ""
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
  cond
    case a < b then -1
    case a > b then 1
  end ?? 0
end;

sort(l, numberComparer)
      `.trim(),
  },
  {
    id: 'isoDateString',
    name: 'Is ISO date string',
    description: 'Check if string is formatted as an ISO date string.',
    code: `
let isoDateString? = (data) -> do
  let m = data re-match #"^(\\d{4})-(\\d{2})-(\\d{2})$";

  if m then
    let [year, month, day] = slice(m, 1) map number;
    let leapYear = zero?(year mod 4) && (!zero?(year mod 100) || zero?(year mod 400));

    let invalid = 
      (year < 1900 || year > 2100)
      || (month < 1 || month > 12)
      || (day < 1 || day > 31)
      || day > 30 && (month == 4 || month == 6 || month == 9 || month == 11)
      || month == 2 && (leapYear && day > 29 || !leapYear && day > 28);

    not(invalid)
  else
    false
  end
end;

perform(@dvala.io.print, isoDateString?("1978-12-21"));
perform(@dvala.io.print, isoDateString?("197-12-21"));
  `.trim(),
  },

  {
    id: 'label-from-value',
    name: 'label-from-value',
    description: 'Find label to corresponding value in array of { label, value }-objects.',
    code: `
let label-from-value = (items, value) -> do
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

label-from-value(items, "name");
  `.trim(),
  },
  {
    id: 'labels-from-values',
    name: 'labels-from-values',
    description: 'Find labels to corresponding values in array of { label, value }-objects.',
    code: `
let labels-from-values = ($array, $values) -> do
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

labels-from-values(arr, ["name", "age"])
`.trim(),
  },
  {
    id: 'fizzbuzz',
    name: 'FizzBuzz',
    description: 'The classic FizzBuzz challenge using a for comprehension with let bindings and cond.',
    code: `
// FizzBuzz: print numbers 1 to 30, but
//   multiples of 3 → "Fizz"
//   multiples of 5 → "Buzz"
//   multiples of both → "FizzBuzz"

let fizzbuzz = for (
  n in range(1, 31)
  let div3 = zero?(n mod 3)
  let div5 = zero?(n mod 5)
) -> cond
  case div3 && div5 then "FizzBuzz"
  case div3 then "Fizz"
  case div5 then "Buzz"
end ?? str(n);

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
perform(@dvala.io.println, "Editor has " ++ str(count(original)) ++ " characters");

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
]
