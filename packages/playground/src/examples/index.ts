export interface Example {
  name: string;
  description: string;
  source: string;
  csvData?: Record<string, string>;
}

export const examples: Example[] = [
  {
    name: "Family",
    description: "Ancestor relation via transitive closure (recursive, with CSV data)",
    source: `extensional parent(name: text, child: text).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

?- ancestor("alice", X).`,
    csvData: {
      parent: `name,child
alice,bob
alice,carol
bob,dave
bob,eve`,
    },
  },
  {
    name: "Fibonacci",
    description: "First 10 Fibonacci numbers using linear recursion and arithmetic",
    source: `% Fibonacci sequence
%
% Compute the first 10 Fibonacci numbers using recursion and arithmetic.
% Each step carries both the previous and current value so the recursive
% rule only references fib_step once in the body (linear recursion).

% fib_step(I, Prev, Curr): the I-th Fibonacci number is Curr,
% and the (I-1)-th is Prev.
fib_step(1, 0, 1).
fib_step(I + 1, Curr, Prev + Curr) :- fib_step(I, Prev, Curr), I < 10.

% Extract the sequence: the I-th Fibonacci number is V.
fibonacci(I, V) :- fib_step(I, _, V).

?- fibonacci(I, V).`,
  },
  {
    name: "Primes",
    description: "Sieve of Eratosthenes using ranges, negation, and arithmetic",
    source: `% Sieve of Eratosthenes — finding prime numbers
%
% Generates all prime numbers up to 30 using ranges, arithmetic,
% and negation.

% Candidate numbers from 2 to 30
num(I) :- I in [2 .. 30].

% D divides X if D * (X / D) = X, using integer division.
divides(D, X) :- num(D), num(X), D > 1, D < X, Q = X / D, P = D * Q, P = X.

% X is composite if some number divides it
composite(X) :- divides(_, X).

% X is prime if it's a candidate and not composite
prime(X) :- num(X), not composite(X).

?- prime(X).`,
  },
  {
    name: "River Crossing",
    description: "Farmer, wolf, goat, and cabbage puzzle",
    source: `% Farmer, Wolf, Goat, and Cabbage puzzle
%
% A farmer needs to ferry a wolf, a goat, and a cabbage across a river.
% The boat can carry the farmer plus at most one item. If left unattended:
%   - the wolf eats the goat
%   - the goat eats the cabbage

shore("n").
shore("s").

opp("n", "s").
opp("s", "n").

% Initial state: everyone on the north shore
state("n", "n", "n", "n").

% Farmer takes the wolf
state(X, X, U, V) :- safe(X, X, U, V), opp(X, X1), state(X1, X1, U, V).
% Farmer takes the goat
state(X, Y, X, V) :- safe(X, Y, X, V), opp(X, X1), state(X1, Y, X1, V).
% Farmer takes the cabbage
state(X, Y, U, X) :- safe(X, Y, U, X), opp(X, X1), state(X1, Y, U, X1).
% Farmer crosses alone
state(X, Y, U, V) :- safe(X, Y, U, V), opp(X, X1), state(X1, Y, U, V).

% Safety: farmer is with the goat
safe(X, Y, X, V) :- shore(X), shore(Y), shore(V).
% Safety: farmer is not with the goat, wolf and cabbage must be with farmer
safe(X, X, G, X) :- opp(X, G).

?- state("s", "s", "s", "s").`,
  },
  {
    name: "Aggregates",
    description: "Aggregate functions (count, sum, avg, min, max) on student scores",
    source: `% Aggregates — student scores
%
% Demonstrates aggregate functions: count, sum, avg, min, max.

extensional scores(student: text, subject: text, score: integer).

% Average score per student
student_avg(Student, avg(Score)) :- scores(Student, _, Score).

% Number of subjects each student took
num_subjects(Student, count(Subject)) :- scores(Student, Subject, _).

% Total score per student
total_score(Student, sum(Score)) :- scores(Student, _, Score).

% Students whose worst score is above 80
worst_score(Student, min(Score)) :- scores(Student, _, Score).
strong(Student) :- worst_score(Student, W), W > 80.

?- student_avg(Student, Avg).
?- num_subjects(Student, N).
?- total_score(Student, Total).
?- strong(Student).`,
    csvData: {
      scores: `student,subject,score
alice,math,92
alice,science,88
alice,english,95
bob,math,78
bob,science,85
bob,english,72
carol,math,96
carol,science,91
carol,english,89
dave,math,65
dave,science,70
dave,english,80`,
    },
  },
  {
    name: "Shortest Path",
    description: "Shortest path in a weighted graph using min aggregate",
    source: `% Find the Shortest Path
%
% Given a weighted road network with cycles, find the shortest distance
% between every pair of connected towns.

road("castle", "village", 2).
road("castle", "forest", 5).
road("village", "bridge", 4).
road("village", "castle", 3).
road("forest", "river", 3).
road("river", "village", 1).
road("river", "bridge", 2).

% Upper bound on useful path length: sum of all edge weights.
max_cost(sum(W)) :- road(_, _, W).

% All paths with their total cost, bounded to ensure termination.
path(X, Y, C) :- road(X, Y, C).
path(X, Y, C) :-
  path(X, Z, C0), road(Z, Y, C1),
  max_cost(Max), C0 < Max,
  C = C0 + C1.

% Shortest path cost for each pair of towns.
shortest(X, Y, min(C)) :- path(X, Y, C).

?- shortest(X, Y, C).`,
  },
  {
    name: "Find the Thief",
    description: "Logic puzzle: use clues to identify a suspect from 20 villagers",
    source: `% Find the Thief
%
% A thief has stolen the king's golden crown. Using clues from witnesses,
% narrow down the list of 20 villagers to find the culprit.

extensional person(name: text, age: integer, hair: text, height: integer, location: text).

% Helper: hair colors that count as "dark"
dark_hair("black").
dark_hair("brown").

% Helper: the thief's height is NOT between 180 and 190 cm
height_180_190(Name) :- person(Name, _, _, Height, _), Height > 180, Height < 190.

% Aggregate helpers
max_age(max(Age)) :- person(_, Age, _, _, _).
max_height(max(Height)) :- person(_, _, _, Height, _).
avg_height(avg(Height)) :- person(_, _, _, Height, _).
max_east_age(max(Age)) :- person(_, Age, _, _, "east").

% The suspect must match all clues
suspect(Name) :-
  person(Name, Age, Hair, Height, "east"),
  Height > 150,
  Hair != "blond",
  Hair != "bald",
  Age >= 30,
  dark_hair(Hair),
  not height_180_190(Name),
  max_age(MaxAge), Age != MaxAge,
  max_height(MaxH), Height != MaxH,
  avg_height(AvgH), Height < AvgH,
  max_east_age(MaxEAge), Age = MaxEAge.

?- suspect(X).`,
    csvData: {
      person: `name,age,hair,height,location
anna,25,blond,170,north
brian,45,brown,185,north
clara,68,gray,155,north
derek,35,black,178,north
emma,28,red,162,north
frank,50,bald,180,south
gina,22,blond,148,south
henry,40,brown,172,south
iris,55,gray,160,south
jake,32,black,192,south
kate,52,brown,165,east
leo,45,blond,180,east
mia,29,black,168,east
nick,33,brown,175,east
olive,48,red,156,east
peter,33,blond,188,west
quinn,27,brown,163,west
rosa,58,black,145,west
sam,44,brown,177,west
tara,36,red,170,west`,
    },
  },
];
