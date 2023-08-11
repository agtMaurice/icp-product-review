import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
  Principal,
  int,
} from "azle";
import { v4 as uuidv4 } from "uuid";

/**
 * This type represents a Product that is to be reviewed
 */
type Product = Record<{
  id: string; // id of product
  name: string; // name of product
  description: string; // Description of product
  URL: string; // product image url
  Ratings: Vec<number>; //product ratings
  created_at: nat64; // created time stamp of the blog post
  updated_at: Opt<nat64>; // // updated time stamp of the blog post
}>;

//define a Record to store the user input for the Product
type ProductPayload = Record<{
  name: string;
  description: string;
  URL: string;
}>;

/**
 * `productStorage` - it's a key-value datastructure that is used to store products.
 * {@link StableBTreeMap} is a self-balancing tree that acts as a durable data storage that keeps data across canister upgrades.
 * For the sake of this contract we've chosen {@link StableBTreeMap} as a storage for the next reasons:
 * - `insert`, `get` and `remove` operations have a constant time complexity - O(1)
 *
 * Brakedown of the `StableBTreeMap<string, Product>` datastructure:
 * - the key of map is a `productId`
 * - the value in this map is a product itself `post` that is related to a given key (`productId`)
 *
 * Constructor values:
 * 1) 0 - memory id where to initialize a map
 * 2) 44 - it's a max size of the key in bytes (size of the uuid value that we use for ids).
 * 3) 1024 - it's a max size of the value in bytes.
 * 2 and 3 are not being used directly in the constructor but the Azle compiler utilizes these values during compile time
 */
const productStorage = new StableBTreeMap<string, Product>(0, 44, 1024);

// get all products
$query;
export function getProducts(): Result<Vec<Product>, string> {
  // Suggestion 1: The function should handle the case when the productStorage is empty and return a meaningful message.
  if (productStorage.isEmpty()) {
    return Result.Err("No products found");
  }
  return Result.Ok(productStorage.values());
}

// get product by Id
$query;
export function getProduct(id: string): Result<Product, string> {
  if (!id) {
    return Result.Err<Product, string>("Invalid id");
  }

  try {
    const product = productStorage.get(id);
    return match(product, {
      Some: (p) => Result.Ok<Product, string>(p),
      None: () =>
        Result.Err<Product, string>(`a product with id=${id} not found`),
    });
  } catch (error) {
    return Result.Err<Product, string>(
      `an error occurred while retrieving the product with id=${id}`
    );
  }
}

// add a new product
$update;
export function addProduct(payload: ProductPayload): Result<Product, string> {
  const { name, description, URL } = payload;

  // Input validation
  if (!name || !description || !URL) {
    return Result.Err<Product, string>("Missing required fields");
  }

  const existingProduct = productStorage.values().find((p) => p.name === name);
  if (existingProduct) {
    return Result.Err<Product, string>(
      "Product with the same name already exists"
    );
  }

  const product: Product = {
    id: uuidv4(),
    Ratings: [],
    created_at: ic.time(),
    updated_at: Opt.None,
    name,
    description,
    URL,
  };

  try {
    productStorage.insert(product.id, product);
    return Result.Ok(product);
  } catch (error) {
    return Result.Err<Product, string>("Error inserting product into storage");
  }
}

// to validate the product rating to make sure it falls beetween the accepted boundries.

function validateRating(rating: number): void {
  if (rating < 1 || rating > 5) {
    throw new Error("Rating should be an integer between 1 and 5.");
  }
}

$update;
export function calculateAverageRating(id: string): Result<number, string> {
  if (id === null || id === undefined) {
    return Result.Err<number, string>("Invalid product id");
  }

  return match(productStorage.get(id), {
    Some: (product) => {
      if (
        product.Ratings === undefined ||
        product.Ratings === null ||
        product.Ratings.length === 0
      ) {
        return Result.Err<number, string>("Invalid rating");
      }

      const sum = product.Ratings.reduce((acc, current) => acc + current, 0);
      return Result.Ok<number, string>(
        parseFloat((sum / product.Ratings.length).toFixed(2))
      );
    },
    None: () =>
      Result.Err<number, string>(
        `couldn't find product with id=${id}. product not found`
      ),
  });
}

// rate a product

$update;
export function rateProduct(
  id: string,
  rating: number
): Result<Product, string> {
  validateRating(rating);

  try {
    const productResult = productStorage.get(id);

    return match(productResult, {
      Some: (product) => {
        const updatedProduct: Product = {
          ...product,
          Ratings: [...product.Ratings, rating],
          updated_at: Opt.Some(ic.time()),
        };

        productStorage.insert(id, updatedProduct);

        return Result.Ok<Product, string>(updatedProduct);
      },
      None: () => Result.Err<Product, string>("Product not found."),
    });
  } catch (error) {
    return Result.Err<Product, string>("Error during to rate the product");
  }
}

// update a product
$update;
export function updateProduct(
  id: string,
  payload: ProductPayload
): Result<Product, string> {
  const { name, description, URL } = payload;

  // Input validation
  if (!name || !description || !URL) {
    return Result.Err<Product, string>("Missing required fields");
  }
  return match(productStorage.get(id), {
    Some: (product) => {
      const updatedProduct: Product = {
        ...product,
        ...payload,
        updated_at: Opt.Some(ic.time()),
      };
      productStorage.insert(product.id, updatedProduct);
      return Result.Ok<Product, string>(updatedProduct);
    },
    None: () =>
      Result.Err<Product, string>(
        `couldn't update a product with id=${id}. product not found`
      ),
  });
}

// delete a product
$update;
export function deleteProduct(id: string): Result<Product, string> {
  return match(productStorage.remove(id), {
    Some: (deletedProduct) => Result.Ok<Product, string>(deletedProduct),
    None: () =>
      Result.Err<Product, string>(
        `couldn't delete a product with id=${id}. product not found.`
      ),
  });
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
