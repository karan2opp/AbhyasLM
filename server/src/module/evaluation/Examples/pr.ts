// ============ EASY (Definition / Concept Knowledge / Example — 0.4/0.4/0.2) ============

export const Eval_Easy_INPUT = {
    answers: [
        {
            question_text: "What is the purpose of the <a> tag in HTML? Explain the role of the href attribute and what the target='_blank' setting does.",
            max_marks: 2,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.4, key_points: ["States the <a> tag is used to create a hyperlink"] },
                    { name: "Concept Knowledge", weight: 0.4, key_points: ["Explains the href attribute specifies the destination URL", "Explains target='_blank' opens the link in a new tab"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives an example anchor tag using both href and target='_blank'"] }
                ]
            },
            student_answer: "The <a> tag is used to make links in HTML. The href attribute tells the browser where the link should go."
        },
        {
            question_text: "What is a variable? Describe two rules that should be followed when naming a variable.",
            max_marks: 2,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.4, key_points: ["States that a variable is a named container used to store a value"] },
                    { name: "Concept Knowledge", weight: 0.4, key_points: ["A variable name should start with a letter (not a number)", "A variable name should avoid using reserved keywords"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives at least one example of a valid variable name"] }
                ]
            },
            student_answer: "A variable stores a value under a name so you can use it later. It shouldn't start with a number, and it shouldn't be something the language already uses, like 'if' or 'function'."
        },
        {
            question_text: "What is a primitive data type? Name any three primitive data types and briefly describe what kind of value each one stores.",
            max_marks: 2,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.4, key_points: ["States a primitive data type is a basic data type that stores a single, simple value"] },
                    { name: "Concept Knowledge", weight: 0.4, key_points: ["Correctly names three primitive types (e.g., number, string, boolean)", "Correctly describes what kind of value each named type stores"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives a valid example value for at least one of the named types"] }
                ]
            },
            student_answer: "number, string, boolean."
        }
    ]
};

export const Eval_Easy_OUTPUT = {
    evaluations: [
        {
            question_text: "What is the purpose of the <a> tag in HTML? Explain the role of the href attribute and what the target='_blank' setting does.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly states the <a> tag is used to create links (hyperlinks)." },
                { name: "Concept Knowledge", score: 0.5, explanation: "Correctly explains href specifies the destination, but does not mention what target='_blank' does." },
                { name: "Example", score: 0, explanation: "No example anchor tag is given." }
            ],
            feedback: "Good grasp of the <a> tag and href. To improve, explain what target='_blank' does (opens the link in a new tab) and include a short example like <a href=\"...\" target=\"_blank\">."
        },
        {
            question_text: "What is a variable? Describe two rules that should be followed when naming a variable.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly describes a variable as a named container for a value." },
                { name: "Concept Knowledge", score: 1, explanation: "Correctly states both naming rules — not starting with a number, and avoiding reserved keywords." },
                { name: "Example", score: 0, explanation: "No example variable name is given." }
            ],
            feedback: "Definition and both naming rules are correct. Just add a concrete example, like myAge or totalCount, to complete the answer."
        },
        {
            question_text: "What is a primitive data type? Name any three primitive data types and briefly describe what kind of value each one stores.",
            category_scores: [
                { name: "Definition", score: 0, explanation: "No definition of what a primitive data type is has been given." },
                { name: "Concept Knowledge", score: 0.5, explanation: "Correctly names three valid primitive types, but does not describe what kind of value each one stores." },
                { name: "Example", score: 0, explanation: "No example value is given for any of the types." }
            ],
            feedback: "You've named three valid primitive types, but the question also asks for a definition of what a primitive type is, a brief description of what each named type stores, and an example value — try expanding on each of these next time."
        }
    ]
};

// ============ MEDIUM (Definition / Concept Knowledge / Example / Correct Application / Distinguishing Related Concepts — 0.2 each) ============

export const Eval_Medium_INPUT = {
    answers: [
        {
            question_text: "Explain the difference between the map and filter array methods. In your answer, describe what each method returns.",
            max_marks: 3,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.2, key_points: ["Defines map as transforming every element", "Defines filter as selecting elements based on a condition"] },
                    { name: "Concept Knowledge", weight: 0.2, key_points: ["States both methods return a new array"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives a simple code example of mapping an array of numbers (e.g., multiplying each by 2) and filtering (e.g., selecting numbers greater than 10)"] },
                    { name: "Correct Application", weight: 0.2, key_points: ["Correctly explains map's output array has the same length as the input"] },
                    { name: "Distinguishing Related Concepts", weight: 0.2, key_points: ["Explains filter's output array may be shorter than the input, unlike map"] }
                ]
            },
            student_answer: "map transforms every element in an array and returns a new array with the transformed values, for example [1,2,3].map(x => x*2) gives [2,4,6]. filter picks elements that pass a condition. Both return new arrays instead of changing the original one."
        },
        {
            question_text: "Explain the structure of the CSS Box Model. In your description, detail the spatial order of content, padding, border, and margin from the inside out, and distinguish between padding and margin.",
            max_marks: 3,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.2, key_points: ["States the box model consists of content, padding, border, and margin"] },
                    { name: "Concept Knowledge", weight: 0.2, key_points: ["Correctly states the spatial order from inside out: content, padding, border, margin"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives a valid example of applying margin and padding to an element (e.g., padding: 10px; margin: 20px;)"] },
                    { name: "Correct Application", weight: 0.2, key_points: ["Correctly explains padding is space inside the border"] },
                    { name: "Distinguishing Related Concepts", weight: 0.2, key_points: ["Clearly distinguishes padding (inside border) from margin (outside border, between elements)"] }
                ]
            },
            student_answer: "The box model goes content, then border, then padding, then margin from the inside out. Padding and margin are both spacing but padding is inside somewhere and margin is outside."
        },
        {
            question_text: "How does the flex-direction property affect the layout of items inside a flex container?",
            max_marks: 3,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.2, key_points: ["States flex-direction determines the direction of the main axis"] },
                    { name: "Concept Knowledge", weight: 0.2, key_points: ["Mentions values such as row and column"] },
                    { name: "Example", weight: 0.2, key_points: ["Gives a visual or code example showing items stacked vertically when flex-direction is set to column"] },
                    { name: "Correct Application", weight: 0.2, key_points: ["Correctly explains that setting flex-direction to column stacks items vertically instead of horizontally"] },
                    { name: "Distinguishing Related Concepts", weight: 0.2, key_points: ["Explains that changing flex-direction also changes what counts as the main axis for justify-content"] }
                ]
            },
            student_answer: "flex-direction sets the main axis direction of a flex container. Setting it to row (the default) lays items left to right, and column lays them top to bottom, for example: display: flex; flex-direction: column; would stack items vertically. Since the main axis changes, justify-content also behaves differently — it now aligns along the vertical direction instead of horizontal."
        }
    ]
};

export const Eval_Medium_OUTPUT = {
    evaluations: [
        {
            question_text: "Explain the difference between the map and filter array methods. In your answer, describe what each method returns.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly defines map as transforming elements and filter as selecting elements based on a condition." },
                { name: "Concept Knowledge", score: 1, explanation: "Correctly states both methods return a new array." },
                { name: "Example", score: 0.5, explanation: "Gives a valid map example ([1,2,3].map(x => x*2)) but does not give a corresponding example for filter." },
                { name: "Correct Application", score: 0, explanation: "Does not mention that map's output array has the same length as the input array." },
                { name: "Distinguishing Related Concepts", score: 0.6, explanation: "Correctly implies filter selects elements based on a condition ('picks elements that pass a condition'), which is most of the way there — but never explicitly states the resulting array may be shorter than the input, the category's specific key point." }
            ],
            feedback: "Nice use of a concrete map example. To strengthen this answer: add a filter example too, and explicitly mention that map always keeps the same array length while filter can return a shorter array."
        },
        {
            question_text: "Explain the structure of the CSS Box Model. In your description, detail the spatial order of content, padding, border, and margin from the inside out, and distinguish between padding and margin.",
            category_scores: [
                { name: "Definition", score: 0.7, explanation: "Correctly names all four components — content, border, padding, margin — which is most of what this category asks for, but never explicitly frames them together as 'the box model,' leaving the definition slightly incomplete." },
                { name: "Concept Knowledge", score: 0, explanation: "States the spatial order incorrectly — border is placed before padding, when the correct order is content, padding, border, margin." },
                { name: "Example", score: 0, explanation: "No code example is given." },
                { name: "Correct Application", score: 0.2, explanation: "Says padding is 'inside somewhere,' which gestures at the idea but is too vague to demonstrate it's specifically between content and border — a fragment of the right idea, not a real explanation." },
                { name: "Distinguishing Related Concepts", score: 0.4, explanation: "Correctly senses padding is 'inside' and margin is 'outside,' but never anchors this to the border as the actual dividing line, so the distinction stays imprecise." }
            ],
            feedback: "The spatial order needs correcting — it should be content, padding, border, margin (padding comes before border, not after). Be more specific about where padding and margin sit relative to the border, and include a code example to make this concrete."
        },
        {
            question_text: "How does the flex-direction property affect the layout of items inside a flex container?",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly states flex-direction sets the main axis direction." },
                { name: "Concept Knowledge", score: 1, explanation: "Correctly mentions both row and column values." },
                { name: "Example", score: 1, explanation: "Gives a correct code example showing column stacking items vertically." },
                { name: "Correct Application", score: 1, explanation: "Correctly explains column stacks items top to bottom." },
                { name: "Distinguishing Related Concepts", score: 1, explanation: "Correctly explains that justify-content's behavior changes with the main axis." }
            ],
            feedback: "Complete and precise — the axis explanation, code example, and the connection to justify-content are all correctly covered."
        }
    ]
};

// ============ HARD (Definition / Concept Knowledge / Example / Correct Application / Depth of Reasoning / Edge Cases — 0.15/0.15/0.15/0.15/0.25/0.15) ============

export const Eval_Hard_INPUT = {
    answers: [
        {
            question_text: "Explain how a closure allows an inner function to retain access to variables from its outer function's scope, even after the outer function has finished executing.",
            max_marks: 4,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.15, key_points: ["Defines a closure as a function bundled with its lexical environment"] },
                    { name: "Concept Knowledge", weight: 0.15, key_points: ["States the inner function retains a reference to the outer function's variables"] },
                    { name: "Example", weight: 0.15, key_points: ["Gives a basic example of an outer function returning an inner function that references a variable from the outer scope"] },
                    { name: "Correct Application", weight: 0.15, key_points: ["Correctly describes an inner function accessing an outer function's variable"] },
                    { name: "Depth of Reasoning", weight: 0.25, key_points: ["Explains WHY the variable persists after the outer function returns (reference retained, not re-evaluated)", "Connects this behavior explicitly to lexical scope, not just general 'memory'"] },
                    { name: "Edge Cases / Real-world Scenario", weight: 0.15, key_points: ["Mentions a practical use case, e.g., maintaining state across multiple calls"] }
                ]
            },
            student_answer: "A closure is when a function inside another function can still use the outer function's variables even after the outer function is done running. This happens because the inner function keeps a link to those variables. For example, function outer() { let count = 0; return function inner() { count++; return count; } } — here inner keeps access to count. This is useful for things like counters that need to remember a value between calls."
        },
        {
            question_text: "Describe how z-index determines stacking order, and explain under what condition it has no effect on an element.",
            max_marks: 4,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.15, key_points: ["States z-index controls the stacking order of overlapping elements"] },
                    { name: "Concept Knowledge", weight: 0.15, key_points: ["States a higher z-index value places an element above lower-valued elements"] },
                    { name: "Example", weight: 0.15, key_points: ["Provides an example of z-index failing to apply on a statically positioned element"] },
                    { name: "Correct Application", weight: 0.15, key_points: ["Correctly states z-index only applies to positioned elements"] },
                    { name: "Depth of Reasoning", weight: 0.25, key_points: ["Explains why z-index has no effect on a statically positioned element", "Explains the concept of a stacking context and how it groups elements"] },
                    { name: "Edge Cases / Real-world Scenario", weight: 0.15, key_points: ["Gives an example of an element unexpectedly not respecting z-index due to missing position property"] }
                ]
            },
            student_answer: "z-index controls the order elements stack in when they overlap, with higher values on top."
        },
        {
            question_text: "What is a higher-order function? Explain, with reasoning, how accepting a function as an argument or returning a function enables patterns like function composition or callbacks.",
            max_marks: 4,
            rubric: {
                categories: [
                    { name: "Definition", weight: 0.15, key_points: ["States a higher-order function either takes a function as an argument, returns a function, or both"] },
                    { name: "Concept Knowledge", weight: 0.15, key_points: ["Mentions callbacks as functions passed to be invoked later"] },
                    { name: "Example", weight: 0.15, key_points: ["Gives a practical example, such as passing a callback to setTimeout or array methods like map"] },
                    { name: "Correct Application", weight: 0.15, key_points: ["Correctly explains a scenario where a function is passed as an argument to another function"] },
                    { name: "Depth of Reasoning", weight: 0.25, key_points: ["Explains how this enables function composition (combining simple functions into more complex behavior)", "Explains why this pattern increases code reusability and flexibility"] },
                    { name: "Edge Cases / Real-world Scenario", weight: 0.15, key_points: ["References a practical use, e.g., array methods like map/filter themselves being higher-order functions"] }
                ]
            },
            student_answer: "A higher-order function takes a function as an argument or returns one. This is powerful because it lets you compose small, focused functions together into bigger behavior — for example, you could write a generic 'compose' function that chains several small transform functions into one pipeline, rather than writing one big function that does everything. This makes each piece reusable and easy to test on its own. array methods like map and filter are themselves higher-order functions since they accept a callback."
        }
    ]
};

export const Eval_Hard_OUTPUT = {
    evaluations: [
        {
            question_text: "Explain how a closure allows an inner function to retain access to variables from its outer function's scope, even after the outer function has finished executing.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly describes a closure as an inner function retaining access to an outer function's variables." },
                { name: "Concept Knowledge", score: 1, explanation: "Clearly states the inner function keeps a link/reference to the outer function's variables." },
                { name: "Example", score: 1, explanation: "Gives a valid, correctly structured example of an outer function returning an inner function that accesses 'count'." },
                { name: "Correct Application", score: 1, explanation: "Correctly describes the inner function using the outer variable across calls." },
                { name: "Depth of Reasoning", score: 0.6, explanation: "Correctly explains that access persists after the outer function returns because the inner function keeps a reference — capturing much of the 'why' — but never names lexical scope as the actual mechanism, which this category specifically asks for." },
                { name: "Edge Cases / Real-world Scenario", score: 1, explanation: "Gives a valid practical use case — a counter remembering a value between calls." }
            ],
            feedback: "Strong answer with a clear, correct code example and a good real-world use case. To push this further, explicitly name lexical scope as the mechanism that determines which variables the closure can access, rather than just describing the observed behavior."
        },
        {
            question_text: "Describe how z-index determines stacking order, and explain under what condition it has no effect on an element.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly states z-index controls stacking order." },
                { name: "Concept Knowledge", score: 1, explanation: "Correctly states higher values stack above lower ones." },
                { name: "Example", score: 0, explanation: "No example of z-index failing on a statically positioned element is given." },
                { name: "Correct Application", score: 0, explanation: "Does not mention that z-index only applies to positioned elements." },
                { name: "Depth of Reasoning", score: 0, explanation: "Does not address the second half of the question — under what condition z-index has no effect — at all." },
                { name: "Edge Cases / Real-world Scenario", score: 0, explanation: "No scenario is given." }
            ],
            feedback: "You've correctly described the basic stacking behavior, but the question specifically also asks when z-index has no effect. Add: z-index only works on positioned elements (not static, the default), so it silently does nothing if position isn't set — that's the key condition this answer is missing."
        },
        {
            question_text: "What is a higher-order function? Explain, with reasoning, how accepting a function as an argument or returning a function enables patterns like function composition or callbacks.",
            category_scores: [
                { name: "Definition", score: 1, explanation: "Correctly defines a higher-order function." },
                { name: "Concept Knowledge", score: 0.3, explanation: "Shows real conceptual understanding through its discussion of composition, but never uses the word 'callback' or describes a function being passed to be invoked later — the category's specific key point is essentially unaddressed, credited only for adjacent relevance." },
                { name: "Example", score: 1, explanation: "Gives a valid, well-explained composition example." },
                { name: "Correct Application", score: 1, explanation: "Correctly describes passing functions as arguments in the context of composition." },
                { name: "Depth of Reasoning", score: 1, explanation: "Clearly explains how composition works and why it improves reusability and testability." },
                { name: "Edge Cases / Real-world Scenario", score: 1, explanation: "Correctly references map/filter as higher-order functions." }
            ],
            feedback: "Excellent depth on function composition and reusability. The one gap is the callback concept specifically — mention that a callback is a function passed to be invoked later (e.g., inside setTimeout), since the question asks about both composition and callbacks."
        }
    ]
};