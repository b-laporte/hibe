
# Hibe - Immutable data without pain

**tl;dr** hibe is library to create immutable data objects through a 'mutable' api

## Key features
- eventual immutability API concept (cf. below)
- support of [Directed Acyclic Graphs][DAG]
- actions as pure functions (cf. [TodoMVC](src/samples/todomvc/todo.ts) example)
- easily observable data (cf. [watch()][wiki])
- memoized computed properties (cf. [@computed][decorators])
- based on JS decorators (no need for any preprocessor)
- Array and Map collections support (cf. [@datalist][collections] and [@datamap][collections])
- possibility to store any JavaScript value or object (cf. [@value][decorators]) - only root reference will be watched
- possibility to create datasets from a JSON structure (cf. [load()][toFromJS]) - note: load will be lazy (i.e. objects will be loaded on read)
- possibility to convert datasets to JS objects (cf. [convert()][toFromJS])
- mostly tree-shakeable (what you don't use will be stripped-out from your code - cf. [rollup](https://rollupjs.org/guide/en) or [webpack](https://webpack.js.org/guides/tree-shaking/))
- easily testable (cf. [mutationComplete()][wiki])
- support of data object inheritance

[wiki]: ../../wiki
[decorators]: ../../wiki/Decorators
[collections]: ../../wiki/Collections
[toFromJS]: ../../wiki/To-&--From-JS

## Core concept

Hibe has been primarily designed to work in uni-directional dataflow contexts (cf. [flux](https://facebook.github.io/flux/) or [redux](https://redux.js.org/basics/data-flow)). In this architecture, User Interface updates are triggered by state changes - and state changes are triggered through actions (in other words UI elements never refresh themselves directly).

<div style="text-align:center">

![Unidirectional-data-flow](doc/unidirectional-data-flow.png?raw=true)

</div>

After a closer look we realize that there are two main sequences in this model:
- a **read-only** sequence that occurs after state changes to trigger UI view updates. In this sequence, data should be ideally ***immutable*** as it gives a very simple way to avoid recalculating pieces that haven't changed on the UI side.
- a (mostly)**write-only** sequence that occurs during the action processing. In this sequence, having ***mutable*** data is convenient as actions can be written through very straightforward and maintainable code.

Hibe allows exactly that: have immutable objects that provide a mutable api to create new versions of those objects. To be more precise, only the last version of a hibe object can be virtually mutated. In this respect, hibe objects behave as if they were ***eventually immutable***.

Let's imagine a very simple example to concretely illustrate what it means. 

```js
// Todo data for http://todomvc.com/examples/vanillajs/
@Dataset()
export class Todo {
    @value() description = "";   // description of the todo task
    @value() completed = false;  // is the task completed?
    @value() editing = false;    // is the task being edited?
}

let todo = new Todo();
```
The Todo class in the previous code snippet models an item in the todo mvc application. The todo instance is immutable - but it can still be virtually updated like this:

```js
todo.description = "Call Marge";
todo.completed = true;
console.log(todo.description); // print "Call Marge"
console.log(todo.completed);   // print true
```

When this code is run hibe implicitly creates a new version for the todo object and redirects all read/write operation to it - so that todo is unchanged, even though it seems mutable from the developer's perspective.

<div style="text-align:center">

![Before micro-task](doc/todos_1_2.png?raw=true)

</div>

Of course this would be pointless if the new version remained hidden. In practice hibe triggers a micro-task (used by [Promises](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/) ) to asynchronously spawn the new versions as soon as the 'mutation sequence' ends.

When the new version has spawn, the code will behave as follows:

```js
console.log(todo.description); // print "" -> value before mutation
console.log(todo.completed);   // print false

todo = latestVersion(todo);    // latestVersion is a hibe utility function that return the latest version of a dataset
console.log(todo.description); // print "Call Marge" -> value after mutation
console.log(todo.completed);   // print true
```

<div style="text-align:center">

![After micro-task](doc/todos_1_2_after_mt.png?raw=true)

</div>

You may wonder how the application can get notified of the micro-task result. There are actually 2 ways: 
- either by watching a data object
```js
watch(todo, (newTodo: Todo) => {
    // a new version of todo has been spawn
    todo = newTodo;
    // let's refresh the UI...
})
```
- or by explicitly waiting for the micro-task through a promise
```js
todo = await mutationComplete(todo);
// the new todo version is now accessible
```


Of course, more complex ([directed acyclic][DAG]) graphs can be created:

```js
// TodoApp structure for http://todomvc.com/examples/vanillajs/
@Dataset
export class TodoApp {
    @value() newEntry = "";
    @datalist(Todo) list: Todo[];
    @value() filter = "ALL";
}
```

Hibe objects (aka. datasets) also support ***@computed*** properties to expose values that are calculated from other properties (and that will not be recalculated if its dependencies don't change):

```js
// TodoApp structure for http://todomvc.com/examples/vanillajs/
@Dataset
export class TodoApp {
    @value() newEntry = "";
    @datalist(Todo) list: Todo[];
    @value() filter = "ALL";

    // return an array of Todo sorted according to the filter property
    @computed() get listView(): Todo[] {
        if (this.filter === "ALL") {
            return this.list;
        } else {
            let isComplete = (this.filter === "COMPLETED");
            return this.list.filter(item => item.completed === isComplete);
        }
    }

    // return the number of items that are not completed    
    @computed() get itemsLeft(): number {
        let itemsLeft = 0;
        this.list.forEach(item => {
            itemsLeft += item.completed ? 0 : 1;
        });
        return itemsLeft;
    }
}
````

## Using hibe

- in a typescript environment: copy the hibe.ts file in your project
- in a JS environment: generate the hibe.js file (cf. below) and include it in your project
Note: a packaged version of hibe will be published on npm in the coming months.

## Compiling hibe on your machine

Simply install [yarn](https://yarnpkg.com/) - then run
```bash
yarn install
yarn build-hive
```
This will generate a hibe.js in a dist folder.

To run tests:
```bash
yarn test
```

## License

[Apache V2.0](LICENSE.md)

[DAG]:https://medium.com/@hamzasurti/advanced-data-structures-part-1-directed-acyclic-graph-dag-c1d1145b5e5a
